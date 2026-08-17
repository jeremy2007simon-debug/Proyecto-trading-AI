/**
 * Block 6, Fase 18-19 + forward-testing hardening — RS3M's idempotent,
 * NYSE-calendar-aware monthly rebalance scheduler entry point.
 *
 * DESIGNED TO BE FIRED DAILY (every weekday, shortly after NYSE open) by
 * a Routine — but this file itself decides whether today is the correct
 * day to act, rather than depending on the trigger's own cron expression
 * to know about holidays. On any day that isn't the correct execution
 * day, this is a fast, silent (but LOGGED) no-op.
 *
 * ALGORITHM (see docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md for the
 * full write-up):
 *   1. If today (America/New_York) isn't an NYSE trading day -> no-op.
 *   2. The "target month" is always the PREVIOUS calendar month relative
 *      to today — the only month guaranteed to have fully closed. This
 *      month's LAST trading day is the signal's data-cutoff close.
 *   3. If today is before the next trading day after that close -> no-op
 *      (defensive; should not happen given step 2, but never assumed).
 *   4. If that target month already has an idempotency marker -> no-op
 *      (already executed — the normal state on every day of a month
 *      after the one rebalance day).
 *   5. Otherwise: fetch daily candles capped at EXACTLY that month's last
 *      trading day's close (so the fetched data's latest month bucket is
 *      guaranteed complete, even if this script is running several days
 *      late after an outage — see `fetchRs3mUniverse`'s `to` param doc).
 *   6. Run the engine in DRY_RUN (default) or PAPER_TRADING mode per env.
 *      `rs3m-engine.ts#execute()` internally reconciles against the
 *      broker's own order history before submitting anything (restart/
 *      retry safety — see `order-idempotency.ts`) and polls submitted
 *      orders to a terminal fill status before returning.
 *   7. Every attempt (executed, blocked, or skipped) is appended to the
 *      forward-evidence ledger (`forward-evidence-store.ts`) — separate
 *      from the backtest/OOS datasets — and fanned out through the
 *      notification dispatcher (`notifications/dispatcher.ts`).
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block6/paper/run-rebalance.ts
 *
 * Respects DRY_RUN (default "true") and PAPER_TRADING (default "false")
 * from .env.local / the environment — see .env.example for the exact
 * gating rules.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../../lib/sandbox-io";
setupSandboxIO();

import { appendEvent } from "./event-log";
import { hasExecutedThisMonth, markExecuted } from "./idempotency-store";
import { determineRebalanceTarget } from "./scheduling";
import { resolveAlpacaPaperCredentials } from "./credentials";
import { appendForwardEvidence } from "./forward-evidence-store";
import { createDefaultNotificationDispatcher } from "./notifications/dispatcher";
import { fetchRs3mUniverse } from "../lib/fetch-candidate-assets";
import { createAlpacaPaperTradingClient } from "@/core/execution/alpaca-paper-client";
import { getEasternWallClockParts, isCalendarDateTradingDay, type CalendarDateOnly } from "@/core/market-hours/nyse-calendar";
import { createRs3mEngine, type Rs3mExecuteResult, type Rs3mPlanResult } from "@/core/paper-trading/rs3m/rs3m-engine";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { buildForwardEvidenceRecord } from "@/core/paper-trading/rs3m/forward-evidence";
import type { Rs3mNotificationEvent } from "@/core/paper-trading/rs3m/notification-events";
import type { RelativeStrengthAssetInput } from "@/core/backtesting/research/relative-strength";

const DRY_RUN_OUTPUT_DIR = join(process.cwd(), "results", "block6", "paper", "dry-run");
const ORDERS_OUTPUT_DIR = join(process.cwd(), "results", "block6", "paper", "orders");

const notifications = createDefaultNotificationDispatcher();

function notify(type: Rs3mNotificationEvent["type"], summary: string, detail: Record<string, unknown> = {}): Promise<void> {
  return notifications.notify({ type, timestamp: new Date().toISOString(), summary, detail });
}

/** Picks GUARD_BLOCKED vs the more specific STALE_SIGNAL alert type — both are in the spec's event vocabulary. */
function guardBlockedNotificationType(planResult: Rs3mPlanResult): Rs3mNotificationEvent["type"] {
  return planResult.guardResult.violations.some((v) => v.guard === "STALE_SIGNAL") ? "STALE_SIGNAL" : "GUARD_BLOCKED";
}

async function main() {
  const now = new Date();
  const todayParts = getEasternWallClockParts(now);
  const today: CalendarDateOnly = { year: todayParts.year, month: todayParts.month, day: todayParts.day };

  if (!isCalendarDateTradingDay(today)) {
    appendEvent("NO_OP_NOT_TRADING_DAY", { today });
    return;
  }

  const target = determineRebalanceTarget(today);
  const { decisionMonthKey, dataCutoffIso } = target;

  if (!target.isExecutionDayOrLater) {
    appendEvent("NO_OP_NOT_TRADING_DAY", { today, reason: "before this month's execution day", executionDay: target.executionDay });
    return;
  }

  if (await hasExecutedThisMonth(decisionMonthKey)) {
    appendEvent("NO_OP_ALREADY_EXECUTED", { decisionMonthKey, today });
    return;
  }

  console.log(`[run-rebalance] Fetching data for decision month ${decisionMonthKey}, capped at ${dataCutoffIso}...`);
  const byMarket = await fetchRs3mUniverse("all", RS3M_CANDIDATE_V1.datasetFrom, dataCutoffIso);
  if (!byMarket) {
    appendEvent("ERROR", { message: "Could not fetch RS3M universe data.", decisionMonthKey });
    await notify("DATA_ERROR", "Could not fetch RS3M universe data — refusing to compute a signal.", { decisionMonthKey });
    process.exitCode = 1;
    return;
  }
  const assets: RelativeStrengthAssetInput[] = RS3M_CANDIDATE_V1.universe.map((market) => ({ market, candles: byMarket.get(market)! }));

  const paperCredentials = resolveAlpacaPaperCredentials();
  if (!paperCredentials) {
    appendEvent("ERROR", { message: "ALPACA_PAPER_API_KEY_ID / ALPACA_PAPER_API_SECRET_KEY not configured." });
    await notify("SCHEDULER_ERROR", "Missing Alpaca paper trading credentials — failing closed, no signal computed.", { decisionMonthKey });
    process.exitCode = 1;
    return;
  }

  const tradingClient = createAlpacaPaperTradingClient(paperCredentials);
  const engine = createRs3mEngine({ tradingClient, hasExecutedThisMonth, nowIso: () => new Date().toISOString() });

  const isDryRun = process.env.DRY_RUN !== "false";
  const isPaperTradingEnabled = process.env.PAPER_TRADING === "true";

  if (isDryRun) {
    const planResult = await engine.dryRun(assets);
    appendEvent("SIGNAL_COMPUTED", { decisionMonthKey, selectedMarket: planResult.signal?.selectedMarket, ranking: planResult.signal?.ranking });
    await notify("SIGNAL_GENERATED", `Ranking computed for ${decisionMonthKey}: winner ${planResult.signal?.selectedMarket ?? "CASH"}.`, { decisionMonthKey, ranking: planResult.signal?.ranking });

    appendEvent(planResult.wouldExecute ? "REBALANCE_PENDING" : "SAFEGUARD_TRIGGERED", {
      wouldExecute: planResult.wouldExecute,
      blockedReason: planResult.blockedReason,
      orders: planResult.plan?.orders,
      violations: planResult.guardResult.violations,
    });
    if (planResult.wouldExecute) {
      await notify("DRY_RUN_PASSED", `Dry-run plan for ${decisionMonthKey} would execute — all guards passed.`, { decisionMonthKey, targetAsset: planResult.plan?.targetAsset });
    } else if (planResult.blockedReason !== "NO_REBALANCE_NEEDED") {
      await notify(guardBlockedNotificationType(planResult), `Dry-run blocked for ${decisionMonthKey}: ${planResult.blockedReason}.`, { decisionMonthKey, violations: planResult.guardResult.violations });
    }

    appendForwardEvidence(buildForwardEvidenceRecord({ nowIso: now.toISOString(), planResult }));

    mkdirSync(DRY_RUN_OUTPUT_DIR, { recursive: true });
    const outputPath = join(DRY_RUN_OUTPUT_DIR, `${decisionMonthKey}-${now.toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(outputPath, JSON.stringify({ mode: "DRY_RUN", generatedAt: now.toISOString(), decisionMonthKey, dataCutoffIso, ...planResult }, null, 2));
    console.log(`\n=== DRY_RUN complete (no orders submitted). Plan written to ${outputPath} ===`);
    console.log(`Signal: ${planResult.signal?.selectedMarket ?? "CASH"} | Would execute: ${planResult.wouldExecute} | Blocked reason: ${planResult.blockedReason ?? "n/a"}`);
    return;
  }

  if (!isPaperTradingEnabled) {
    appendEvent("ERROR", { message: "DRY_RUN=false requires PAPER_TRADING=true — refusing to submit real (paper) orders without both explicitly set." });
    await notify("SCHEDULER_ERROR", "DRY_RUN=false without PAPER_TRADING=true — refusing to submit orders.", { decisionMonthKey });
    process.exitCode = 1;
    return;
  }

  await notify("REBALANCE_STARTED", `Attempting real (paper) execution for ${decisionMonthKey}.`, { decisionMonthKey });
  const executeResult: Rs3mExecuteResult = await engine.execute(assets);

  if (executeResult.skipped) {
    appendEvent("SAFEGUARD_TRIGGERED", { decisionMonthKey, skipReason: executeResult.skipReason });
    const notificationType = /broker|order submission|fail-closed/i.test(executeResult.skipReason ?? "") ? "BROKER_ERROR" : guardBlockedNotificationType(executeResult.planResult);
    await notify(notificationType, `Execution skipped for ${decisionMonthKey}: ${executeResult.skipReason}.`, { decisionMonthKey, skipReason: executeResult.skipReason });
    appendForwardEvidence(buildForwardEvidenceRecord({ nowIso: now.toISOString(), planResult: executeResult.planResult, executeResult }));
    console.log(`\n=== Execution skipped: ${executeResult.skipReason} ===`);
    return;
  }

  for (const order of executeResult.ordersSubmitted) {
    const eventType = order.status === "filled" ? "ORDER_FILLED" : order.status === "partially_filled" ? "PARTIAL_FILL" : "ORDER_SUBMITTED";
    await notify(eventType, `${order.side.toUpperCase()} ${order.symbol}: status ${order.status}.`, { orderId: order.orderId, clientOrderId: order.clientOrderId, symbol: order.symbol, side: order.side, status: order.status, filledAvgPrice: order.filledAvgPrice, filledQty: order.filledQty });
  }
  if (executeResult.anyOrderStillInFlight) {
    appendEvent("ORDER_PARTIAL_OR_FAILED", { decisionMonthKey, orders: executeResult.ordersSubmitted });
  }

  await markExecuted(decisionMonthKey, executeResult.ordersSubmitted);
  mkdirSync(ORDERS_OUTPUT_DIR, { recursive: true });
  writeFileSync(join(ORDERS_OUTPUT_DIR, `${decisionMonthKey}.json`), JSON.stringify({ decisionMonthKey, executedAt: now.toISOString(), orders: executeResult.ordersSubmitted }, null, 2));
  appendEvent("ORDERS_SUBMITTED", { decisionMonthKey, orders: executeResult.ordersSubmitted });

  const positionsAfterResult = await tradingClient.getPositions();
  appendForwardEvidence(
    buildForwardEvidenceRecord({
      nowIso: now.toISOString(),
      planResult: executeResult.planResult,
      executeResult,
      positionsAfter: positionsAfterResult.ok ? positionsAfterResult.value.map((p) => ({ symbol: p.symbol, marketValue: p.marketValue })) : undefined,
    }),
  );

  await notify("REBALANCE_COMPLETED", `Rebalance executed for ${decisionMonthKey}: ${executeResult.ordersSubmitted.length} order(s).`, { decisionMonthKey, anyOrderStillInFlight: executeResult.anyOrderStillInFlight });
  console.log(`\n=== Rebalance executed for ${decisionMonthKey}: ${executeResult.ordersSubmitted.length} order(s) submitted. ===`);
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  appendEvent("ERROR", { message });
  await notify("SCHEDULER_ERROR", `Unhandled error in run-rebalance: ${message}.`, {});
  process.exitCode = 1;
});
