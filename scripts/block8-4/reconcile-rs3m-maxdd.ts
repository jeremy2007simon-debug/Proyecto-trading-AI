/**
 * Block 8.4 §14 — RS3M MaxDD reconciliation. CRITICAL, gating item:
 * Block 6's authoritative report (`docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md`
 * §10) states RS3M_CANDIDATE_V1's MaxDD = 23.99%, computed via
 * `scripts/block6/audit-rotation-engine.ts` over the OFFICIAL frozen
 * window `RS3M_LONG_HISTORY_FROM = "2016-01-01"` (== `RS3M_CANDIDATE_V1
 * .datasetFrom`), using ALPACA adjusted (`adjustment: "all"`) data.
 * Block 8.3's `rs3m-benchmark.ts` computed 65.1% MaxDD using YAHOO
 * adjusted data with NO datasetFrom filter (full available history back
 * to SPY's 1993 listing — ~400 months vs Block 6's 124).
 *
 * This script isolates the two candidate root causes by computing
 * RS3M's OWN monthly return series (via `runRelativeStrengthBacktest`,
 * the exact same production function both Block 6 and Block 8.3 call —
 * reused here strictly as a READ-ONLY BENCHMARK, never modified) under
 * FOUR combinations of {data source, window}:
 *
 *   (A) Yahoo data, FULL history        <- what Block 8.3 actually did
 *   (B) Yahoo data, 2016-01-01 onward   <- isolates PERIOD effect (same data source as A, Block 6's window)
 *   (C) Alpaca data, FULL history       <- not run (Alpaca unreachable this session, §2.1 of Block 8.3 report)
 *   (D) Alpaca data, 2016-01-01 onward  <- Block 6's actual number (23.99%), read from its own report, not re-run (same reason)
 *
 * Comparing (A) vs (B) — both on Yahoo data — isolates the PERIOD
 * effect while holding data source constant. If (B) ~= Block 6's 23.99%
 * (D), the discrepancy is a pure period-length artifact, not a data-
 * source or methodology bug. Alpaca is confirmed unreachable in this
 * environment (Block 8.3 §2.1) so (C) cannot be directly re-run; the
 * Yahoo-vs-Alpaca data-source question is instead addressed via the
 * Block 6 report's own OWN raw-vs-adjusted comparison (§6 of that
 * report) and this script's independent Yahoo dividend/split spot-check
 * (§6 of this block's report) — never by silently swapping in a
 * different provider's numbers as if they were the original.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block8-4/reconcile-rs3m-maxdd.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runRelativeStrengthBacktest, type RelativeStrengthAssetInput } from "@/core/backtesting/research/relative-strength";
import { computeMaxDrawdownFromMonthlyReturns, computeMonthlyReturnMetrics } from "@/core/backtesting/research/portfolio-metrics";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { toAdjustedCandles } from "@/core/us-index-research/daily-series";
import type { UsIndexDailyBar, UsIndexMarket } from "@/core/us-index-research/types";

const DATASETS_DAILY_DIR = join(process.cwd(), "results", "block8-3", "datasets", "daily");
const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "maxdd-reconciliation");

const TICKER_BY_MARKET: Record<string, UsIndexMarket> = { SP500: "SPY", NASDAQ100: "QQQ", RUSSELL2000: "IWM", DOWJONES: "DIA" };

function loadDailyBars(ticker: UsIndexMarket): UsIndexDailyBar[] {
  return JSON.parse(readFileSync(join(DATASETS_DAILY_DIR, `${ticker}_1d.json`), "utf8"));
}

function buildAssets(fromDate: string | undefined): RelativeStrengthAssetInput[] {
  return RS3M_CANDIDATE_V1.universe.map((market) => {
    const ticker = TICKER_BY_MARKET[market];
    let bars = loadDailyBars(ticker);
    if (fromDate) bars = bars.filter((b) => b.date >= fromDate);
    return { market, candles: toAdjustedCandles(bars, ticker) };
  });
}

function summarize(label: string, assets: RelativeStrengthAssetInput[]) {
  const run = runRelativeStrengthBacktest(assets, { lookbackMonths: RS3M_CANDIDATE_V1.lookbackMonths, benchmarkMarket: "SP500" });
  const monthlyReturnsPct = run.periods.map((p) => p.periodReturnPct);
  // Two independent ways to compute MaxDD from the SAME monthly series — must agree, proving the engine's own maxDrawdownPct and the generic portfolio-metrics helper are consistent.
  const maxDdFromEngine = run.maxDrawdownPct;
  const maxDdFromGenericHelper = computeMaxDrawdownFromMonthlyReturns(monthlyReturnsPct);
  const metrics = computeMonthlyReturnMetrics(monthlyReturnsPct);
  return {
    label,
    monthsCount: run.periods.length,
    firstMonth: run.periods[0]?.decisionMonth,
    lastMonth: run.periods[run.periods.length - 1]?.holdMonth,
    cagrPct: run.cagrPct,
    maxDdFromEngine,
    maxDdFromGenericHelper,
    maxDdAgreesToWithin1bp: Math.abs(maxDdFromEngine - maxDdFromGenericHelper) < 0.01,
    genericMetrics: metrics,
  };
}

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const full = summarize("A: Yahoo data, FULL history (what Block 8.3's rs3m-benchmark.ts actually did)", buildAssets(undefined));
  const officialWindow = summarize(`B: Yahoo data, Block 6's official window (${RS3M_CANDIDATE_V1.datasetFrom.slice(0, 10)} onward)`, buildAssets(RS3M_CANDIDATE_V1.datasetFrom.slice(0, 10)));

  const block6Authoritative = {
    label: "D: Alpaca data, Block 6's official window (from docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md §10 — not re-run, Alpaca unreachable this session)",
    maxDdPct: 23.99,
    cagrPct: 17.24,
    monthsCount: 124,
    source: "docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md",
  };

  const periodEffectPct = full.maxDdFromEngine - officialWindow.maxDdFromEngine;
  const residualVsBlock6Pct = officialWindow.maxDdFromEngine - block6Authoritative.maxDdPct;

  const result = {
    generatedAt: new Date().toISOString(),
    conclusion:
      residualVsBlock6Pct < 3
        ? "PERIOD-LENGTH ARTIFACT, NOT A BUG: restricting the same Yahoo data to Block 6's official 2016-01-01 window reproduces a MaxDD within a few points of Block 6's own Alpaca-sourced 23.99% figure. The 65.1% Block 8.3 number is real and correctly computed, but for a materially longer (~33y vs ~10.3y) unofficial extended window that captures the 2000-02 and 2008 crises RS3M's official window does not."
        : "UNRESOLVED — residual gap exceeds the period-effect explanation; requires further investigation (see residualVsBlock6Pct).",
    full,
    officialWindow,
    block6Authoritative,
    periodEffectPct,
    residualVsBlock6Pct,
  };

  writeFileSync(join(OUTPUT_DIR, "reconciliation.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main();
