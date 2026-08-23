/**
 * Block 10 §12/§13, Block 10.1 §4/§5/§6 — C-A's SEPARATE daily shadow
 * Routine entry point. NEVER touches RS3M's Routine, `run-rebalance.ts`,
 * or any of its per-month state (`results/block6/**`) — this script owns
 * its own, disjoint state under `results/block10/ca-forward/**`.
 *
 * DESIGNED TO BE FIRED DAILY (every weekday, after NYSE close) by a
 * Routine. Steps, per §12:
 *   1. Skip entirely on a non-trading day, or before the close (§10).
 *      Uses `isCalendarDateTradingDay` — a genuine NYSE holiday
 *      calendar, not a blind Monday-Friday assumption (Block 10.1 §5).
 *   2. Fetch market data (§9: Alpaca-preferring, Yahoo-fallback).
 *   3. Reconstruct prior shadow state from the append-only evidence
 *      ledger (`evidence-store.ts#readLastShadowState` — no separate
 *      mutable state file, §21).
 *   4. Refuse anything dated on/before the frozen forward-start instant
 *      (§8 — no retroactive backfill).
 *   5. Evaluate the canonical signal + safety guards + hypothetical fill
 *      (`evaluateShadowDay` — pure, zero I/O, zero broker imports).
 *   6. Persist the day's evidence (§7, append-only, every attempt incl.
 *      BLOCKED ones).
 *   7. Fan out non-spammy notifications (§15).
 *   8. NEVER submit an order — this script imports nothing from
 *      `@/core/execution/*` (statically proven, see
 *      `tests/core/ca-shadow/no-broker-writes.test.ts`).
 *
 * IDEMPOTENT (§13): a second run on the same processed date is blocked
 * by `evaluateShadowDay`'s own `DUPLICATE_DATE` guard, backed by the
 * durable (already-fsynced) evidence ledger — never an in-memory flag
 * that a restart could lose.
 *
 * `runCaShadowRoutine()` is exported (Block 10.1 §21) so the Daily Close
 * Report orchestrator (`scripts/block10/daily-report/run-daily-close.ts`)
 * can run C-A's evaluation FIRST, in-process, and only then read the
 * resulting state for the report — never a race between two independent
 * schedules. `main()` below is unchanged in behavior; it now just calls
 * the exported function.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block10/ca-shadow/run-ca-shadow-routine.ts
 */
import { getEasternWallClockParts, isCalendarDateTradingDay, type CalendarDateOnly } from "@/core/market-hours/nyse-calendar";
import { evaluateShadowDay, type ShadowDayResult } from "@/core/ca-shadow/shadow-engine";
import type { CanonicalCaSignalPoint } from "@/core/ca-shadow/canonical-signal";
import { isBeforeCaForwardStart, CA_FORWARD_START_TIMESTAMP } from "@/core/ca-shadow/forward-start";
import { buildCaNotificationEvents } from "@/core/ca-shadow/notification-events";
import { fetchCaMarketData } from "./fetch-ca-market-data";
import { appendCaForwardEvidence, readLastShadowState } from "./evidence-store";
import { createDefaultCaNotificationDispatcher, type CaNotificationDispatcher } from "./notifications/dispatcher";

/** NYSE regular session closes 16:00 America/New_York; wait a little past that for the day's bar to actually post upstream before fetching. */
const MIN_EASTERN_HOUR_TO_RUN = 16;

export type CaShadowRoutineOutcome =
  | { kind: "NOT_TRADING_DAY" }
  | { kind: "BEFORE_CLOSE" }
  | { kind: "NO_DATA" }
  | { kind: "BEFORE_FORWARD_START"; lastDate: string }
  | { kind: "ALREADY_PROCESSED"; lastDate: string }
  | { kind: "PROCESSED"; dayResult: ShadowDayResult }
  | { kind: "ERROR"; message: string };

function logActivity(message: string, detail: Record<string, unknown> = {}): void {
  console.log(`[ca-shadow-routine] ${message}`, detail);
}

export interface RunCaShadowRoutineParams {
  /** Test-only / orchestrator-only override — defaults to `new Date()`. */
  now?: Date;
  /** Test-only — defaults to `createDefaultCaNotificationDispatcher()`. */
  dispatcher?: CaNotificationDispatcher;
}

/**
 * Runs one C-A shadow evaluation attempt. Never throws — every failure
 * mode (no data, before close, not a trading day, already processed,
 * before forward start, unhandled error) is a typed `CaShadowRoutineOutcome`
 * the caller can branch on, so an orchestrator (the daily report script)
 * can tell "genuinely processed today" apart from every no-op reason
 * without re-deriving this script's own logic.
 */
export async function runCaShadowRoutine(params: RunCaShadowRoutineParams = {}): Promise<CaShadowRoutineOutcome> {
  const now = params.now ?? new Date();
  const notifications = params.dispatcher ?? createDefaultCaNotificationDispatcher();

  try {
    const todayParts = getEasternWallClockParts(now);
    const today: CalendarDateOnly = { year: todayParts.year, month: todayParts.month, day: todayParts.day };

    if (!isCalendarDateTradingDay(today)) {
      logActivity("NO_OP_NOT_TRADING_DAY", { today });
      return { kind: "NOT_TRADING_DAY" };
    }
    if (todayParts.hour < MIN_EASTERN_HOUR_TO_RUN) {
      logActivity("NO_OP_BEFORE_CLOSE", { today, hourEt: todayParts.hour, minHourEt: MIN_EASTERN_HOUR_TO_RUN });
      return { kind: "BEFORE_CLOSE" };
    }

    const marketData = await fetchCaMarketData();
    if (!marketData) {
      logActivity("ERROR_NO_DATA", { today });
      await notifications.notify({ type: "CA_SHADOW_ERROR", timestamp: now.toISOString(), summary: "Could not fetch C-A market data from any source (Alpaca or Yahoo) — refusing to compute a signal.", detail: { today } });
      return { kind: "NO_DATA" };
    }

    const points: CanonicalCaSignalPoint[] = marketData.candles.map((c) => ({ date: c.timestamp.slice(0, 10), close: c.close }));
    const lastDate = points[points.length - 1]?.date;

    if (lastDate && isBeforeCaForwardStart(`${lastDate}T00:00:00.000Z`)) {
      logActivity("NO_OP_BEFORE_FORWARD_START", { lastDate, forwardStart: CA_FORWARD_START_TIMESTAMP });
      return { kind: "BEFORE_FORWARD_START", lastDate };
    }

    const priorState = readLastShadowState();
    if (lastDate && lastDate === priorState.lastProcessedDate) {
      // Fast, silent (but logged) no-op — mirrors RS3M's own "already executed" pre-check. `evaluateShadowDay`'s
      // own DUPLICATE_DATE guard would catch this too, but skipping the call avoids writing a redundant BLOCKED
      // evidence row every time the scheduler happens to fire again on an already-processed date.
      logActivity("NO_OP_ALREADY_PROCESSED", { lastDate });
      return { kind: "ALREADY_PROCESSED", lastDate };
    }

    const { dayResult } = evaluateShadowDay({
      points,
      priorState,
      nowIso: now.toISOString(),
      dataSource: marketData.source,
      dataCutoffIso: marketData.dataCutoffIso,
      dataAdjustment: marketData.adjustment,
    });

    appendCaForwardEvidence(dayResult);
    logActivity(`Decision: ${dayResult.decision}`, { date: dayResult.date, source: dayResult.dataSource, guardsPassed: dayResult.guardResult.passed, shadowEquityAfter: dayResult.shadowEquityAfter });

    for (const event of buildCaNotificationEvents(dayResult)) {
      await notifications.notify(event);
    }

    if (dayResult.decision === "BLOCKED") {
      console.log(`\n=== C-A shadow BLOCKED for ${dayResult.date}: ${dayResult.guardResult.violations.map((v) => v.guard).join(", ")} ===`);
    } else {
      console.log(`\n=== C-A shadow processed ${dayResult.date}: ${dayResult.decision} (position ${dayResult.positionBefore} -> ${dayResult.positionAfter}), shadowEquity=${dayResult.shadowEquityAfter.toFixed(6)} ===`);
    }
    return { kind: "PROCESSED", dayResult };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logActivity("UNHANDLED_ERROR", { message });
    await notifications.notify({ type: "CA_SHADOW_ERROR", timestamp: new Date().toISOString(), summary: `Unhandled error in run-ca-shadow-routine: ${message}.`, detail: {} });
    return { kind: "ERROR", message };
  }
}

async function main(): Promise<void> {
  const { setupSandboxIO } = await import("../../lib/sandbox-io");
  setupSandboxIO();
  const outcome = await runCaShadowRoutine();
  if (outcome.kind === "NO_DATA" || outcome.kind === "ERROR") process.exitCode = 1;
}

if (require.main === module) {
  main();
}
