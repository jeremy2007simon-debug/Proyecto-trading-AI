/**
 * Block 6, Fase 18-19 — RS3M's idempotent, NYSE-calendar-aware monthly
 * rebalance scheduler entry point.
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
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block6/paper/run-rebalance.ts
 *
 * Respects DRY_RUN (default "true") and PAPER_TRADING (default "false")
 * from .env.local / the environment — see .env.example for the exact
 * gating rules. This session only ever exercises DRY_RUN=true.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../../lib/sandbox-io";
setupSandboxIO();

import { appendEvent } from "./event-log";
import { hasExecutedThisMonth, markExecuted } from "./idempotency-store";
import { determineRebalanceTarget } from "./scheduling";
import { fetchRs3mUniverse } from "../lib/fetch-candidate-assets";
import { createAlpacaPaperTradingClient } from "@/core/execution/alpaca-paper-client";
import { getEasternWallClockParts, isCalendarDateTradingDay, type CalendarDateOnly } from "@/core/market-hours/nyse-calendar";
import { createRs3mEngine } from "@/core/paper-trading/rs3m/rs3m-engine";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import type { RelativeStrengthAssetInput } from "@/core/backtesting/research/relative-strength";

const DRY_RUN_OUTPUT_DIR = join(process.cwd(), "results", "block6", "paper", "dry-run");
const ORDERS_OUTPUT_DIR = join(process.cwd(), "results", "block6", "paper", "orders");

function resolveAlpacaPaperCredentials(): { keyId: string; secretKey: string } | undefined {
  const keyId = process.env.ALPACA_PAPER_API_KEY_ID;
  const secretKey = process.env.ALPACA_PAPER_API_SECRET_KEY;
  if (!keyId || !secretKey) return undefined;
  return { keyId, secretKey };
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
    process.exitCode = 1;
    return;
  }
  const assets: RelativeStrengthAssetInput[] = RS3M_CANDIDATE_V1.universe.map((market) => ({ market, candles: byMarket.get(market)! }));

  const paperCredentials = resolveAlpacaPaperCredentials();
  if (!paperCredentials) {
    appendEvent("ERROR", { message: "ALPACA_PAPER_API_KEY_ID / ALPACA_PAPER_API_SECRET_KEY not configured." });
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
    appendEvent(planResult.wouldExecute ? "REBALANCE_PENDING" : "SAFEGUARD_TRIGGERED", {
      wouldExecute: planResult.wouldExecute,
      blockedReason: planResult.blockedReason,
      orders: planResult.plan?.orders,
      violations: planResult.guardResult.violations,
    });

    mkdirSync(DRY_RUN_OUTPUT_DIR, { recursive: true });
    const outputPath = join(DRY_RUN_OUTPUT_DIR, `${decisionMonthKey}-${now.toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(outputPath, JSON.stringify({ mode: "DRY_RUN", generatedAt: now.toISOString(), decisionMonthKey, dataCutoffIso, ...planResult }, null, 2));
    console.log(`\n=== DRY_RUN complete (no orders submitted). Plan written to ${outputPath} ===`);
    console.log(`Signal: ${planResult.signal?.selectedMarket ?? "CASH"} | Would execute: ${planResult.wouldExecute} | Blocked reason: ${planResult.blockedReason ?? "n/a"}`);
    return;
  }

  if (!isPaperTradingEnabled) {
    appendEvent("ERROR", { message: "DRY_RUN=false requires PAPER_TRADING=true — refusing to submit real (paper) orders without both explicitly set." });
    process.exitCode = 1;
    return;
  }

  const executeResult = await engine.execute(assets);
  if (executeResult.skipped) {
    appendEvent("SAFEGUARD_TRIGGERED", { decisionMonthKey, skipReason: executeResult.skipReason });
    console.log(`\n=== Execution skipped: ${executeResult.skipReason} ===`);
    return;
  }

  await markExecuted(decisionMonthKey, executeResult.ordersSubmitted);
  mkdirSync(ORDERS_OUTPUT_DIR, { recursive: true });
  writeFileSync(join(ORDERS_OUTPUT_DIR, `${decisionMonthKey}.json`), JSON.stringify({ decisionMonthKey, executedAt: now.toISOString(), orders: executeResult.ordersSubmitted }, null, 2));
  appendEvent("ORDERS_SUBMITTED", { decisionMonthKey, orders: executeResult.ordersSubmitted });
  console.log(`\n=== Rebalance executed for ${decisionMonthKey}: ${executeResult.ordersSubmitted.length} order(s) submitted. ===`);
}

main().catch((error) => {
  appendEvent("ERROR", { message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
