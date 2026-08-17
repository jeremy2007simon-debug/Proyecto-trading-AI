/**
 * Block 6, Fase 5-11 — full statistical verification of
 * RS3M_CANDIDATE_V1 against real Alpaca data (adjustment="all", the
 * candidate's own `priceAdjustment`).
 *
 * Fase 5:  perfectly comparable benchmarks (SPY buy&hold, equal-weight
 *          buy&hold-static, equal-weight rebalanced-monthly) — the SAME
 *          months as the candidate, never mixed methodologies in one figure.
 * Fase 6:  full metrics (return/CAGR/vol/MaxDD/Sharpe/Sortino/Calmar) on
 *          the LAST 25 realized months, RS3M vs all 3 benchmarks + excess.
 * Fase 7:  alpha (descriptive), tracking error, information ratio,
 *          upside/downside capture, beta, correlation — all vs SPY.
 * Fase 8:  best/worst 1/3/5/10 months, concentration, stress tests.
 * Fase 9:  full year-by-year table.
 * Fase 10: retrospective regime analysis (no look-ahead — the regime
 *          detector's confirmed state at position k depends only on
 *          rawSeries[0..k], see rule-based-regime-detector.ts).
 * Fase 11: holding behavior (time-in-asset, rotation frequency, streaks).
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block6/analyze-candidate.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../lib/sandbox-io";
setupSandboxIO();

import { fetchRs3mUniverse, RS3M_BENCHMARK, RS3M_UNIVERSE } from "./lib/fetch-candidate-assets";
import { runRelativeStrengthBacktest, monthKey, type RelativeStrengthAssetInput, type RelativeStrengthPeriod } from "@/core/backtesting/research/relative-strength";
import { computeBuyAndHoldMonthlyReturns, computeEqualWeightBuyAndHoldMonthlyReturns } from "@/core/backtesting/research/benchmarks";
import { computeMonthlyReturnMetrics } from "@/core/backtesting/research/portfolio-metrics";
import { computeHoldingBehavior, computeRelativePerformance } from "@/core/backtesting/research/relative-performance";
import { createRuleBasedRegimeDetector } from "@/core/market-regime/rule-based-regime-detector";
import type { MarketRegime } from "@/core/market-regime/types";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import type { Candle } from "@/core/market-data/types";

const OUTPUT_DIR = join(process.cwd(), "results", "block6", "analysis");
const LAST_N_MONTHS = 25;

function mean(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** Fase 6: labeled metrics block for one named return series. */
function namedMetrics(label: string, monthlyReturnsPct: readonly number[]) {
  return { label, ...computeMonthlyReturnMetrics(monthlyReturnsPct) };
}

/** Fase 8: concentration analysis. */
function computeConcentration(periods: readonly RelativeStrengthPeriod[]) {
  const sorted = [...periods].sort((a, b) => b.periodReturnPct - a.periodReturnPct);
  const best = (n: number) => sorted.slice(0, n).map((p) => ({ month: p.holdMonth, asset: p.selectedMarket, returnPct: p.periodReturnPct }));
  const worst = (n: number) => sorted.slice(-n).reverse().map((p) => ({ month: p.holdMonth, asset: p.selectedMarket, returnPct: p.periodReturnPct }));

  const totalCompoundedEquity = periods.reduce((eq, p) => eq * (1 + p.periodReturnPct / 100), 1);

  function stressTestRemoving(n: number): number {
    // Sets the top-N best months to 0% (never negative — a stress test on
    // concentration, not a hypothetical worse strategy) and recompounds.
    const topMonths = new Set(sorted.slice(0, n).map((p) => `${p.decisionMonth}->${p.holdMonth}`));
    return periods.reduce((eq, p) => eq * (1 + (topMonths.has(`${p.decisionMonth}->${p.holdMonth}`) ? 0 : p.periodReturnPct / 100)), 1);
  }

  return {
    best1: best(1),
    best3: best(3),
    best5: best(5),
    best10: best(10),
    worst1: worst(1),
    worst3: worst(3),
    worst5: worst(5),
    worst10: worst(10),
    totalReturnPct: (totalCompoundedEquity - 1) * 100,
    stressTestRemovingBest1MonthTotalReturnPct: (stressTestRemoving(1) - 1) * 100,
    stressTestRemovingBest3MonthsTotalReturnPct: (stressTestRemoving(3) - 1) * 100,
    stressTestRemovingBest5MonthsTotalReturnPct: (stressTestRemoving(5) - 1) * 100,
    note: "Stress tests SET the top-N best months to 0% return (not negative) and recompound the rest — this measures how much of the total return is concentrated in a few outlier months, never a hypothetical 'what if it were worse' scenario.",
  };
}

/** Fase 9: year-by-year table. */
function computeAnnualTable(periods: readonly RelativeStrengthPeriod[], spyMonthly: readonly number[], ewMonthly: readonly number[]) {
  const byYear = new Map<string, { rs: number[]; spy: number[]; ew: number[]; switches: number; count: number }>();
  periods.forEach((p, i) => {
    const year = p.holdMonth.slice(0, 4);
    const bucket = byYear.get(year) ?? { rs: [], spy: [], ew: [], switches: 0, count: 0 };
    bucket.rs.push(p.periodReturnPct);
    if (spyMonthly[i] !== undefined) bucket.spy.push(spyMonthly[i]);
    if (ewMonthly[i] !== undefined) bucket.ew.push(ewMonthly[i]);
    bucket.count += 1;
    if (i === 0 || p.selectedMarket !== periods[i - 1].selectedMarket) bucket.switches += 1;
    byYear.set(year, bucket);
  });

  return [...byYear.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([year, bucket]) => {
      const rsTotal = computeMonthlyReturnMetrics(bucket.rs).totalReturnPct;
      const spyTotal = computeMonthlyReturnMetrics(bucket.spy).totalReturnPct;
      const ewTotal = computeMonthlyReturnMetrics(bucket.ew).totalReturnPct;
      return {
        year,
        monthsInYear: bucket.count,
        rs3mReturnPct: rsTotal,
        spyReturnPct: spyTotal,
        equalWeightReturnPct: ewTotal,
        excessVsSpyPp: rsTotal - spyTotal,
        excessVsEqualWeightPp: rsTotal - ewTotal,
        maxDrawdownPctWithinYear: computeMonthlyReturnMetrics(bucket.rs).maxDrawdownPct,
        assetSwitchesInYear: bucket.switches,
      };
    });
}

/** Fase 10: retrospective-only regime tagging (no look-ahead — see module docstring above). */
async function computeRegimeAnalysis(periods: readonly RelativeStrengthPeriod[], spyCandles: readonly Candle[], spyMonthly: readonly number[]) {
  const detector = createRuleBasedRegimeDetector();
  const results = detector.detectSeries({ market: "SP500", timeframe: "1d", candles: spyCandles, indicators: {} });
  const regimeByDate = new Map(results.map((r) => [r.timestamp.slice(0, 10), r.regime]));

  // Look up the regime at each decision's data-cutoff date (the last
  // trading day's close of the decision month) — the LAST candle's
  // regime whose date falls within that month, never a later one.
  function regimeAtMonth(month: string): MarketRegime {
    let last: MarketRegime = "UNKNOWN";
    for (const c of spyCandles) {
      if (monthKey(c.timestamp) === month) {
        last = regimeByDate.get(c.timestamp.slice(0, 10)) ?? last;
      }
    }
    return last;
  }

  const byRegime = new Map<MarketRegime, { returns: number[]; excessVsSpy: number[]; months: string[] }>();
  periods.forEach((p, i) => {
    const regime = regimeAtMonth(p.decisionMonth);
    const bucket = byRegime.get(regime) ?? { returns: [], excessVsSpy: [], months: [] };
    bucket.returns.push(p.periodReturnPct);
    bucket.excessVsSpy.push(p.periodReturnPct - (spyMonthly[i] ?? 0));
    bucket.months.push(p.holdMonth);
    byRegime.set(regime, bucket);
  });

  return [...byRegime.entries()].map(([regime, bucket]) => {
    // Approximation, documented: reconstructs an equity path using ONLY
    // this regime's months, in their original chronological order — the
    // months are not necessarily contiguous in calendar time, so this is
    // NOT a real intra-regime drawdown, just the drawdown of "if you only
    // ever held during this regime's months, back to back."
    const approxMaxDrawdownPct = computeMonthlyReturnMetrics(bucket.returns).maxDrawdownPct;
    return {
      regime,
      monthCount: bucket.returns.length,
      totalReturnPct: computeMonthlyReturnMetrics(bucket.returns).totalReturnPct,
      meanMonthlyReturnPct: mean(bucket.returns),
      meanExcessVsSpyPct: mean(bucket.excessVsSpy),
      hitRatePct: bucket.returns.length > 0 ? (bucket.returns.filter((r) => r > 0).length / bucket.returns.length) * 100 : 0,
      approxIntraRegimeMaxDrawdownPct: approxMaxDrawdownPct,
    };
  });
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("[analyze-candidate] Fetching adjusted (adjustment=all) daily candles 2016-present...");
  const byMarket = await fetchRs3mUniverse("all", RS3M_CANDIDATE_V1.datasetFrom);
  if (!byMarket) {
    console.error("[analyze-candidate] Could not fetch data — aborting.");
    process.exitCode = 1;
    return;
  }

  const config = { lookbackMonths: RS3M_CANDIDATE_V1.lookbackMonths, benchmarkMarket: RS3M_BENCHMARK, rebalanceCostBps: RS3M_CANDIDATE_V1.referenceRebalanceCostBps };
  const assetInputs: RelativeStrengthAssetInput[] = RS3M_UNIVERSE.map((market) => ({ market, candles: byMarket.get(market)! }));
  const engineResult = runRelativeStrengthBacktest(assetInputs, config);

  const months = engineResult.periods.map((p) => p.holdMonth);
  const decisionAndHoldMonths = [engineResult.periods[0]?.decisionMonth, ...months].filter((m): m is string => m !== undefined);

  // Fase 5: perfectly comparable benchmarks over the SAME months.
  const spyAsset = { market: RS3M_BENCHMARK, candles: byMarket.get(RS3M_BENCHMARK)! };
  const universeAssets = RS3M_UNIVERSE.map((m) => ({ market: m, candles: byMarket.get(m)! }));
  const spyBuyAndHoldMonthly = computeBuyAndHoldMonthlyReturns(spyAsset, decisionAndHoldMonths);
  const ewBuyAndHoldStaticMonthly = computeEqualWeightBuyAndHoldMonthlyReturns(universeAssets, decisionAndHoldMonths);
  const ewRebalancedMonthly = engineResult.equalWeightEquityCurve.map((pt, i) => {
    const prevEquity = i === 0 ? 1 : engineResult.equalWeightEquityCurve[i - 1].equity;
    return prevEquity > 0 ? ((pt.equity - prevEquity) / prevEquity) * 100 : 0;
  });
  const rs3mMonthly = engineResult.periods.map((p) => p.periodReturnPct);

  const fase5 = {
    note: "Never mixes buy-and-hold with rebalanced methodology in one figure. equalWeightBuyAndHoldStatic = fixed shares bought once at the start, weights drift. equalWeightRebalancedMonthly = reused directly from the engine's own equalWeightEquityCurve (rebalanced back to equal weight every month).",
    monthCount: months.length,
    spyBuyAndHoldMonthly,
    equalWeightBuyAndHoldStaticMonthly: ewBuyAndHoldStaticMonthly,
    equalWeightRebalancedMonthly: ewRebalancedMonthly,
    rs3mMonthly,
  };

  // Fase 6: last 25 months, all 4 series.
  const last25 = (arr: readonly number[]) => arr.slice(-LAST_N_MONTHS);
  const rs3mLast25Metrics = namedMetrics("RS3M_CANDIDATE_V1", last25(rs3mMonthly));
  const spyLast25Metrics = namedMetrics("SPY Buy&Hold", last25(spyBuyAndHoldMonthly));
  const ewStaticLast25Metrics = namedMetrics("Equal-Weight Buy&Hold (static)", last25(ewBuyAndHoldStaticMonthly));
  const ewRebalancedLast25Metrics = namedMetrics("Equal-Weight (rebalanced monthly)", last25(ewRebalancedMonthly));
  const fase6 = {
    windowMonths: LAST_N_MONTHS,
    rs3m: rs3mLast25Metrics,
    spyBuyAndHold: spyLast25Metrics,
    equalWeightBuyAndHoldStatic: ewStaticLast25Metrics,
    equalWeightRebalancedMonthly: ewRebalancedLast25Metrics,
    excessReturnVsSpyPp: rs3mLast25Metrics.totalReturnPct - spyLast25Metrics.totalReturnPct,
    excessReturnVsEqualWeightRebalancedPp: rs3mLast25Metrics.totalReturnPct - ewRebalancedLast25Metrics.totalReturnPct,
  };

  // Fase 7: relative performance vs SPY, full history and last 25 months.
  const fase7 = {
    fullHistory: computeRelativePerformance(rs3mMonthly, spyBuyAndHoldMonthly),
    last25Months: computeRelativePerformance(last25(rs3mMonthly), last25(spyBuyAndHoldMonthly)),
  };

  // Fase 8
  const fase8 = computeConcentration(engineResult.periods);

  // Fase 9
  const fase9 = computeAnnualTable(engineResult.periods, spyBuyAndHoldMonthly, ewRebalancedMonthly);

  // Fase 10
  console.log("[analyze-candidate] Running retrospective regime detection on SPY daily candles...");
  const fase10 = await computeRegimeAnalysis(engineResult.periods, byMarket.get(RS3M_BENCHMARK)!, spyBuyAndHoldMonthly);

  // Fase 11
  const fase11 = computeHoldingBehavior(engineResult.periods);

  const report = {
    generatedAt: new Date().toISOString(),
    candidateId: RS3M_CANDIDATE_V1.candidateId,
    referenceRebalanceCostBps: RS3M_CANDIDATE_V1.referenceRebalanceCostBps,
    fase5_benchmarks: fase5,
    fase6_last25MonthsMetrics: fase6,
    fase7_relativePerformance: fase7,
    fase8_concentration: fase8,
    fase9_annualTable: fase9,
    fase10_regimeAnalysis: fase10,
    fase11_holdingBehavior: fase11,
  };

  writeFileSync(join(OUTPUT_DIR, "candidate-analysis-report.json"), JSON.stringify(report, null, 2));
  console.log(`\n=== Candidate analysis complete. Report at ${join(OUTPUT_DIR, "candidate-analysis-report.json")} ===`);
  console.log(`Last ${LAST_N_MONTHS}mo: RS3M ${(fase6.rs3m.totalReturnPct as number).toFixed(2)}% | SPY ${(fase6.spyBuyAndHold.totalReturnPct as number).toFixed(2)}% | Excess vs SPY: ${fase6.excessReturnVsSpyPp.toFixed(2)}pp`);
}

main().catch((error) => {
  console.error("[analyze-candidate] Unhandled error:", error);
  process.exitCode = 1;
});
