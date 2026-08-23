/**
 * Block 10 §12/§13 — C-A's SEPARATE daily shadow Routine entry point.
 * NEVER touches RS3M's Routine, `run-rebalance.ts`, or any of its
 * per-month state (`results/block6/**`) — this script owns its own,
 * disjoint state under `results/block10/ca-forward/**`.
 *
 * DESIGNED TO BE FIRED DAILY (every weekday, after NYSE close) by a
 * Routine. Steps, per §12:
 *   1. Skip entirely on a non-trading day, or before the close (§10).
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
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block10/ca-shadow/run-ca-shadow-routine.ts
 */
import { setupSandboxIO } from "../../lib/sandbox-io";
setupSandboxIO();

import { getEasternWallClockParts, isCalendarDateTradingDay, type CalendarDateOnly } from "@/core/market-hours/nyse-calendar";
import { evaluateShadowDay } from "@/core/ca-shadow/shadow-engine";
import type { CanonicalCaSignalPoint } from "@/core/ca-shadow/canonical-signal";
import { isBeforeCaForwardStart, CA_FORWARD_START_TIMESTAMP } from "@/core/ca-shadow/forward-start";
import { buildCaNotificationEvents } from "@/core/ca-shadow/notification-events";
import { fetchCaMarketData } from "./fetch-ca-market-data";
import { appendCaForwardEvidence, readLastShadowState } from "./evidence-store";
import { createDefaultCaNotificationDispatcher } from "./notifications/dispatcher";

/** NYSE regular session closes 16:00 America/New_York; wait a little past that for the day's bar to actually post upstream before fetching. */
const MIN_EASTERN_HOUR_TO_RUN = 16;

const notifications = createDefaultCaNotificationDispatcher();

function logActivity(message: string, detail: Record<string, unknown> = {}): void {
  console.log(`[ca-shadow-routine] ${message}`, detail);
}

async function main(): Promise<void> {
  const now = new Date();
  const todayParts = getEasternWallClockParts(now);
  const today: CalendarDateOnly = { year: todayParts.year, month: todayParts.month, day: todayParts.day };

  if (!isCalendarDateTradingDay(today)) {
    logActivity("NO_OP_NOT_TRADING_DAY", { today });
    return;
  }
  if (todayParts.hour < MIN_EASTERN_HOUR_TO_RUN) {
    logActivity("NO_OP_BEFORE_CLOSE", { today, hourEt: todayParts.hour, minHourEt: MIN_EASTERN_HOUR_TO_RUN });
    return;
  }

  const marketData = await fetchCaMarketData();
  if (!marketData) {
    logActivity("ERROR_NO_DATA", { today });
    await notifications.notify({ type: "CA_SHADOW_ERROR", timestamp: now.toISOString(), summary: "Could not fetch C-A market data from any source (Alpaca or Yahoo) — refusing to compute a signal.", detail: { today } });
    process.exitCode = 1;
    return;
  }

  const points: CanonicalCaSignalPoint[] = marketData.candles.map((c) => ({ date: c.timestamp.slice(0, 10), close: c.close }));
  const lastDate = points[points.length - 1]?.date;

  if (lastDate && isBeforeCaForwardStart(`${lastDate}T00:00:00.000Z`)) {
    logActivity("NO_OP_BEFORE_FORWARD_START", { lastDate, forwardStart: CA_FORWARD_START_TIMESTAMP });
    return;
  }

  const priorState = readLastShadowState();
  if (lastDate && lastDate === priorState.lastProcessedDate) {
    // Fast, silent (but logged) no-op — mirrors RS3M's own "already executed" pre-check. `evaluateShadowDay`'s
    // own DUPLICATE_DATE guard would catch this too, but skipping the call avoids writing a redundant BLOCKED
    // evidence row every time the scheduler happens to fire again on an already-processed date.
    logActivity("NO_OP_ALREADY_PROCESSED", { lastDate });
    return;
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
    return;
  }
  console.log(`\n=== C-A shadow processed ${dayResult.date}: ${dayResult.decision} (position ${dayResult.positionBefore} -> ${dayResult.positionAfter}), shadowEquity=${dayResult.shadowEquityAfter.toFixed(6)} ===`);
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  logActivity("UNHANDLED_ERROR", { message });
  await notifications.notify({ type: "CA_SHADOW_ERROR", timestamp: new Date().toISOString(), summary: `Unhandled error in run-ca-shadow-routine: ${message}.`, detail: {} });
  process.exitCode = 1;
});
