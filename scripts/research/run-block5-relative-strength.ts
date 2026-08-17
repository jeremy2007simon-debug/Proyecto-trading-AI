/**
 * Block 5, Family F — Relative Strength, adapted funnel (2 base
 * configurations: 3-month and 6-month trailing lookback, top-1 monthly
 * rotation among SPY/QQQ/IWM/DIA). Runs SEPARATELY from
 * `run-block5-funnel.ts` because rotation has no stop-loss/R-multiple —
 * see `src/core/backtesting/research/relative-strength.ts`'s own
 * docstring for why this needed a small dedicated backtest function
 * instead of the trade-based engine.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/run-block5-relative-strength.ts
 *
 * Adapted stage mapping (documented, not silently different):
 *   Stage 1 (sanity)   -> at least MIN_SANITY_PERIODS realized months.
 *   Stage 2 (gross)    -> zero-cost (rebalanceCostBps=0) total return > 0.
 *   Stage 3 (costs)    -> rebalanceCostBps in [0,10,20,30,50] (turnover
 *                         cost per switch — the honest equivalent of
 *                         per-trade slippage/spread for a rotation
 *                         strategy), break-even cost via the SAME
 *                         interpolation function the trade-based funnel
 *                         uses (generic over any {bps, signal} series).
 *   Stage 4 (long hist)-> already the only dataset used (2016-now daily).
 *   Stage 5 (OOS)      -> chronological split of the monthly period list
 *                         itself (last 20%), re-run on that sub-slice.
 *   Stage 6 (walk-fwd) -> N/A in the trade-based sense; reports rolling
 *                         12-month-window positive-return rate instead,
 *                         labeled explicitly as an adaptation.
 *   Stage 7 (cross-asset)-> N/A by construction (already rotates across
 *                         all 4 assets) — recorded as such, never
 *                         silently omitted.
 *   Stage 8 (regime)   -> N/A (no per-trade regime tagging exists for a
 *                         monthly rotation) — recorded as such.
 *   Stage 9 (Monte Carlo)-> reshuffles the realized MONTHLY returns
 *                         (with replacement) the same way the trade-based
 *                         Monte Carlo reshuffles R-multiples, computing
 *                         the same drawdown/ending-equity percentiles.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

import { setupSandboxIO } from "../lib/sandbox-io";
setupSandboxIO();

import { createProgressLogger } from "../lib/progress-logger";
import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import type { Candle, MarketDataProvider } from "@/core/market-data/types";
import { runRelativeStrengthBacktest, type RelativeStrengthAssetInput, type RelativeStrengthRunResult } from "@/core/backtesting/research/relative-strength";
import { computeBreakEvenCost, type CostSensitivityPoint } from "@/core/backtesting/research/break-even-cost";
import type { Market } from "@/core/shared/types";

const OUTPUT_DIR = join(process.cwd(), "results", "block5", "relative-strength");
const LONG_HISTORY_FROM = "2016-01-01T00:00:00.000Z";
const ASSETS: Market[] = ["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"];
const BENCHMARK: Market = "SP500";
const REBALANCE_COST_BPS_SWEEP = [0, 10, 20, 30, 50];
const MIN_SANITY_PERIODS = 12;
const MONTE_CARLO_SIMULATIONS = 1000;
const MONTE_CARLO_SEED = 42;

interface RelativeStrengthSpec {
  id: string;
  label: string;
  lookbackMonths: number;
}

const SPECS: RelativeStrengthSpec[] = [
  { id: "relative-strength-lb3", label: "Relative Strength (3mo lookback)", lookbackMonths: 3 },
  { id: "relative-strength-lb6", label: "Relative Strength (6mo lookback)", lookbackMonths: 6 },
];

function gitCommit(): string | undefined {
  try {
    return execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim();
  } catch {
    return undefined;
  }
}

/** Mulberry32 — same deterministic PRNG `monte-carlo.ts` uses, reimplemented here since that module's version isn't exported (kept private to trade-based Monte Carlo). Same algorithm, same reproducibility guarantee. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentileOf(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function percentiles(values: readonly number[]): { p5: number; p50: number; p95: number } {
  const sorted = [...values].sort((a, b) => a - b);
  return { p5: percentileOf(sorted, 5), p50: percentileOf(sorted, 50), p95: percentileOf(sorted, 95) };
}

/** Bootstrap-resamples the realized monthly returns WITH REPLACEMENT — same risk-question framing as the trade-based Monte Carlo: "how much could sequencing alone have hurt/helped," never a profitability forecast. */
function runMonthlyMonteCarlo(monthlyReturnsPct: readonly number[]) {
  if (monthlyReturnsPct.length === 0) {
    return { numSimulations: MONTE_CARLO_SIMULATIONS, seed: MONTE_CARLO_SEED, maxDrawdownPct: { p5: 0, p50: 0, p95: 0 }, endingEquity: { p5: 1, p50: 1, p95: 1 } };
  }
  const rng = mulberry32(MONTE_CARLO_SEED);
  const maxDrawdowns: number[] = [];
  const endingEquities: number[] = [];

  for (let sim = 0; sim < MONTE_CARLO_SIMULATIONS; sim++) {
    let equity = 1;
    let peak = 1;
    let maxDrawdown = 0;
    for (let t = 0; t < monthlyReturnsPct.length; t++) {
      const r = monthlyReturnsPct[Math.floor(rng() * monthlyReturnsPct.length)] / 100;
      equity *= 1 + r;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak > 0 ? ((peak - equity) / peak) * 100 : 0);
    }
    maxDrawdowns.push(maxDrawdown);
    endingEquities.push(equity);
  }

  return {
    numSimulations: MONTE_CARLO_SIMULATIONS,
    seed: MONTE_CARLO_SEED,
    maxDrawdownPct: percentiles(maxDrawdowns),
    endingEquity: percentiles(endingEquities),
  };
}

/** Rolling 12-month-window positive-return rate — the Stage-6 adaptation documented above. */
function rollingWindowPositiveRate(monthlyReturnsPct: readonly number[], windowMonths = 12): { positivePct: number; windowCount: number } {
  if (monthlyReturnsPct.length < windowMonths) return { positivePct: 0, windowCount: 0 };
  let positive = 0;
  let count = 0;
  for (let start = 0; start + windowMonths <= monthlyReturnsPct.length; start++) {
    const windowReturn = monthlyReturnsPct.slice(start, start + windowMonths).reduce((equity, r) => equity * (1 + r / 100), 1) - 1;
    if (windowReturn > 0) positive += 1;
    count += 1;
  }
  return { positivePct: count > 0 ? (positive / count) * 100 : 0, windowCount: count };
}

async function fetchAsset(provider: MarketDataProvider, market: Market): Promise<Candle[] | undefined> {
  const result = await provider.getHistoricalCandles({ market, timeframe: "1d", from: LONG_HISTORY_FROM });
  if (!result.ok) {
    console.error(`  [fetch failed] ${market}/1d: ${result.error.code} — ${result.error.message}`);
    return undefined;
  }
  return result.value.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const providerResult = createMarketDataProvider();
  if (!providerResult.ok) {
    console.error(`[relative-strength] Market data provider unavailable: ${providerResult.error.message}`);
    process.exitCode = 1;
    return;
  }
  const provider = providerResult.value;
  const commit = gitCommit();

  const assetInputs: RelativeStrengthAssetInput[] = [];
  for (const market of ASSETS) {
    const candles = await fetchAsset(provider, market);
    if (!candles || candles.length === 0) {
      console.error(`[relative-strength] Missing data for ${market} — aborting (every asset is required for a fair rotation universe).`);
      process.exitCode = 1;
      return;
    }
    assetInputs.push({ market, candles });
  }

  const progress = createProgressLogger(SPECS.length);

  for (const spec of SPECS) {
    progress.log({ stage: "Stage 1-3", strategy: spec.label }, { increment: false });

    const costPoints: CostSensitivityPoint[] = [];
    let realisticRun: RelativeStrengthRunResult | undefined;
    for (const bps of REBALANCE_COST_BPS_SWEEP) {
      const run = runRelativeStrengthBacktest(assetInputs, { lookbackMonths: spec.lookbackMonths, benchmarkMarket: BENCHMARK, rebalanceCostBps: bps });
      // No R-multiples exist for a rotation strategy — `computeBreakEvenCost`
      // is generic over any {bps, signal} series, so total return (as a
      // fraction) stands in for expectancyR here, documented explicitly.
      costPoints.push({ bps, expectancyR: run.totalReturnPct / 100 });
      if (bps === 20) realisticRun = run; // 20bps round-trip turnover — a conservative, documented reference point for a monthly ETF rotation (far above typical spread+commission for SPY/QQQ/IWM/DIA)
    }
    const breakEven = computeBreakEvenCost(costPoints);

    const zeroCostRun = runRelativeStrengthBacktest(assetInputs, { lookbackMonths: spec.lookbackMonths, benchmarkMarket: BENCHMARK, rebalanceCostBps: 0 });
    const sanityPassed = zeroCostRun.monthsTraded >= MIN_SANITY_PERIODS;

    progress.log({ stage: "Stage 5", strategy: spec.label }, { increment: false });
    // Stage 5 (OOS): chronological split of the realized period list — the last 20%.
    const oosSplitIndex = Math.floor(zeroCostRun.periods.length * 0.8);
    const oosMonthlyReturns = (realisticRun ?? zeroCostRun).periods.slice(oosSplitIndex).map((p) => p.periodReturnPct);
    const oosTotalReturnPct = (oosMonthlyReturns.reduce((equity, r) => equity * (1 + r / 100), 1) - 1) * 100;

    progress.log({ stage: "Stage 6+9", strategy: spec.label }, { increment: false });
    const monthlyReturns = (realisticRun ?? zeroCostRun).periods.map((p) => p.periodReturnPct);
    const rollingWindows = rollingWindowPositiveRate(monthlyReturns);
    const monteCarlo = runMonthlyMonteCarlo(monthlyReturns);

    const output = {
      id: spec.id,
      spec,
      gitCommit: commit,
      generatedAt: new Date().toISOString(),
      assets: ASSETS,
      benchmark: BENCHMARK,
      datasetFrom: LONG_HISTORY_FROM,
      sanityPassed,
      zeroCost: { totalReturnPct: zeroCostRun.totalReturnPct, cagrPct: zeroCostRun.cagrPct, monthsTraded: zeroCostRun.monthsTraded },
      costSensitivity: costPoints,
      breakEven,
      realistic20bps: realisticRun
        ? {
            totalReturnPct: realisticRun.totalReturnPct,
            cagrPct: realisticRun.cagrPct,
            maxDrawdownPct: realisticRun.maxDrawdownPct,
            sharpeRatio: realisticRun.sharpeRatio,
            monthsTraded: realisticRun.monthsTraded,
            benchmarkEquityCurve: realisticRun.benchmarkEquityCurve,
            equalWeightEquityCurve: realisticRun.equalWeightEquityCurve,
            periods: realisticRun.periods,
          }
        : undefined,
      outOfSample: { periodCount: (realisticRun ?? zeroCostRun).periods.length - oosSplitIndex, totalReturnPct: oosTotalReturnPct },
      rollingWindowAdaptedWalkForward: rollingWindows,
      crossAsset: "N/A — rotation already spans SPY/QQQ/IWM/DIA by construction",
      regimeAnalysis: "N/A — no per-trade regime tagging exists for a monthly rotation strategy",
      monteCarlo,
    };

    writeFileSync(join(OUTPUT_DIR, `${spec.id}.json`), JSON.stringify(output, null, 2));
    progress.log({ stage: "Done", strategy: spec.label });
  }

  console.log(`\n=== Relative Strength research complete. Results in ${OUTPUT_DIR} ===`);
}

main().catch((error) => {
  console.error("[relative-strength] Unhandled error:", error);
  process.exitCode = 1;
});
