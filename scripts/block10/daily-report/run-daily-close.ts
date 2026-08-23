/**
 * Block 10.1 §8/§21/§22/§23/§31 — NovaCore Daily Close Report orchestrator.
 * A SEPARATE Routine from both RS3M's `run-rebalance.ts` and C-A's
 * `run-ca-shadow-routine.ts` — never edits either.
 *
 * Ordering (§21 — avoid a race where the report runs before C-A):
 *   1. Confirm today is an NYSE trading day (genuine holiday calendar,
 *      not a blind Monday-Friday assumption) and the session is closed.
 *   2. Idempotency pre-check: a report already exists for today -> no-op.
 *   3. Run C-A's shadow evaluation FIRST, in-process
 *      (`runCaShadowRoutine`) — guarantees today's C-A evidence exists
 *      before the report reads it, no separate schedule to race against.
 *   4. Read RS3M's current (already-refreshed-by-step-3's-own-fetches-
 *      being-irrelevant-to-RS3M) broker/account state — RS3M itself has
 *      no separate "refresh" step here; its own daily dry-run Routine is
 *      independent and this script only READS its already-live state.
 *   5. Aggregate + build the report (`aggregate-daily-close-report.ts` /
 *      `build-daily-close-report.ts`).
 *   6. Persist it immutably (`report-store.ts#writeReportIfAbsent`).
 *   7. Deliver it (`delivery/novacore-in-app-provider.ts`).
 *
 * §23 — if C-A's evaluation itself fails/blocks, the report STILL
 * generates for whatever data IS available; the C-A section of the
 * report simply shows its own honest NO_DATA/BLOCKED state instead of
 * silently omitting the whole report.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block10/daily-report/run-daily-close.ts
 */
import { getEasternWallClockParts, isCalendarDateTradingDay, type CalendarDateOnly } from "@/core/market-hours/nyse-calendar";
import { runCaShadowRoutine } from "../ca-shadow/run-ca-shadow-routine";
import { aggregateDailyCloseReport } from "@/novacore/reports/daily-close/aggregate-daily-close-report";
import { hasReportForDate, writeReportIfAbsent } from "./report-store";
import { deliverDailyReport } from "./delivery/novacore-in-app-provider";

/** Same closed-session threshold as C-A's own routine — the report reads C-A's freshly-written evidence, so it can never run any earlier than C-A itself would act. */
const MIN_EASTERN_HOUR_TO_RUN = 16;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export type DailyCloseRoutineOutcome =
  | { kind: "NOT_TRADING_DAY" }
  | { kind: "BEFORE_CLOSE" }
  | { kind: "ALREADY_REPORTED"; date: string }
  | { kind: "GENERATED"; date: string; attentionCount: number }
  | { kind: "ERROR"; message: string };

function logActivity(message: string, detail: Record<string, unknown> = {}): void {
  console.log(`[daily-close-report] ${message}`, detail);
}

export interface RunDailyCloseReportParams {
  now?: Date;
}

export async function runDailyCloseReport(params: RunDailyCloseReportParams = {}): Promise<DailyCloseRoutineOutcome> {
  const now = params.now ?? new Date();

  try {
    const todayParts = getEasternWallClockParts(now);
    const today: CalendarDateOnly = { year: todayParts.year, month: todayParts.month, day: todayParts.day };

    if (!isCalendarDateTradingDay(today)) {
      logActivity("MARKET_CLOSED", { today });
      return { kind: "NOT_TRADING_DAY" };
    }
    if (todayParts.hour < MIN_EASTERN_HOUR_TO_RUN) {
      logActivity("NO_OP_BEFORE_CLOSE", { today, hourEt: todayParts.hour, minHourEt: MIN_EASTERN_HOUR_TO_RUN });
      return { kind: "BEFORE_CLOSE" };
    }

    const date = `${today.year}-${pad2(today.month)}-${pad2(today.day)}`;

    if (hasReportForDate(date)) {
      logActivity("NO_OP_ALREADY_REPORTED", { date });
      return { kind: "ALREADY_REPORTED", date };
    }

    const caOutcome = await runCaShadowRoutine({ now });
    logActivity("C-A shadow evaluation complete", { outcome: caOutcome.kind });

    const report = await aggregateDailyCloseReport({ date, generatedAt: now.toISOString(), marketSession: "OPEN_SESSION_CLOSED" });

    const writeResult = writeReportIfAbsent(report);
    if (!writeResult.written) {
      // Someone else (a concurrent/retried invocation) wrote it first between our pre-check and now — idempotent by construction.
      logActivity("NO_OP_ALREADY_REPORTED_RACE", { date, reason: writeResult.reason });
      return { kind: "ALREADY_REPORTED", date };
    }

    const priority = report.attention.some((a) => a.type === "HASH_MISMATCH" || a.type === "BROKER_UNAVAILABLE") ? "CRITICAL" : report.attention.length > 0 ? "IMPORTANT" : "INFO";
    await deliverDailyReport({ report, priority });

    logActivity(`Report generated for ${date}`, { attentionCount: report.attention.length, priority });
    console.log(`\n${report.humanSummaryEs}\n`);
    return { kind: "GENERATED", date, attentionCount: report.attention.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logActivity("UNHANDLED_ERROR", { message });
    return { kind: "ERROR", message };
  }
}

async function main(): Promise<void> {
  const { setupSandboxIO } = await import("../../lib/sandbox-io");
  setupSandboxIO();
  const outcome = await runDailyCloseReport();
  if (outcome.kind === "ERROR") process.exitCode = 1;
}

if (require.main === module) {
  main();
}
