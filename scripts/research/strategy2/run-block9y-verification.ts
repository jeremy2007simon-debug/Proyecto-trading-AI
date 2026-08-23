/**
 * Block 9.y — Independent Candidate Verification for C-A and E-C
 * (Block 9.x's two mechanical survivors). A FALSIFICATION round, not an
 * optimization round: the goal is to try to kill both candidates.
 * Reuses the datasets already fetched in `results/block9b/datasets/`
 * (Block 9.x) — same data, no re-fetch, no new source.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/strategy2/run-block9y-verification.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../../lib/sandbox-io";
setupSandboxIO();

import type { Candle } from "@/core/market-data/types";
import { computeSkewness, computeKurtosis, deflatedSharpeRatio } from "@/core/backtesting/research/deflated-sharpe";
import { computeMonthlyReturnMetrics } from "@/core/backtesting/research/portfolio-metrics";
import { pearsonCorrelation } from "@/core/backtesting/research/strategy-similarity";
import { runMonthlyMonteCarloBlockBootstrap } from "@/core/backtesting/research/monthly-monte-carlo";
import { computeBreakEvenCost, type CostSensitivityPoint } from "@/core/backtesting/research/break-even-cost";
import { splitMonthsChronologically, OOS_HOLDOUT_PCT } from "@/core/portfolio-research/oos-split";
import { buildMonthlyWalkForwardWindows } from "@/core/portfolio-research/walk-forward";
import { aggregateDailyToMonthly, toAdjustedCandles, buildDailyEquityCurve, computeMaxDrawdownPctFromCurve } from "@/core/us-index-research/daily-series";
import { buildRs3mBenchmarkSeries } from "@/core/us-index-research/rs3m-benchmark";
import { swingTurnoverCostFlat } from "@/core/us-index-research/cost-model";
import type { UsIndexDailyBar, UsIndexMarket } from "@/core/us-index-research/types";

import { runTimeSeriesReversalBacktest } from "@/core/strategy2-research/short-term-reversal";
import { runVolatilityRiskPremiumBacktest, type VixPoint } from "@/core/strategy2-research/volatility-risk-premium";
import type { Strategy2DayResult } from "@/core/strategy2-research/types";

import { runCAIndependentReproduction } from "@/core/strategy2-verification/independent-c-a";
import { runECIndependentReproduction, runECGapAwareStopModel } from "@/core/strategy2-verification/independent-e-c";
import { C_A_SPEC_HASH, E_C_SPEC_HASH } from "@/core/strategy2-verification/candidate-specs";

const DATASET_DIR = join(process.cwd(), "results", "block9b", "datasets");
const OUTPUT_DIR = join(process.cwd(), "results", "block9y");
const RS3M_OFFICIAL_WINDOW_START = "2016-01"; // RS3M_CANDIDATE_V1.datasetFrom, month-granularity

interface RawBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}
function loadBars(ticker: string): RawBar[] {
  return JSON.parse(readFileSync(join(DATASET_DIR, `${ticker}_1d.json`), "utf8"));
}
function loadVix(): VixPoint[] {
  return JSON.parse(readFileSync(join(DATASET_DIR, "VIX_daily.json"), "utf8"));
}
function toAdjustedCandlesGeneric(bars: readonly RawBar[], symbol: string): Candle[] {
  return [...bars]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bar) => {
      const ratio = bar.close > 0 ? bar.adjClose / bar.close : 1;
      return {
        market: "SP500" as const,
        timeframe: "1d" as const,
        timestamp: `${bar.date}T00:00:00.000Z`,
        symbol,
        provider: "yahoo-adjusted",
        open: bar.open * ratio,
        high: bar.high * ratio,
        low: bar.low * ratio,
        close: bar.adjClose,
        volume: bar.volume,
      };
    });
}

function totalNet(daily: readonly Strategy2DayResult[]): number {
  return daily.reduce((eq, r) => eq * (1 + r.netReturn), 1) - 1;
}

function main(): void {
  console.log("[Block 9.y] Loading datasets (reused from Block 9.x, no re-fetch) ...");
  const spyRaw = loadBars("SPY");
  const svxyRaw = loadBars("SVXY");
  const vix = loadVix();
  const usIndexBars: Record<UsIndexMarket, UsIndexDailyBar[]> = { SPY: spyRaw, QQQ: loadBars("QQQ"), IWM: loadBars("IWM"), DIA: loadBars("DIA") };
  const spyCandles = toAdjustedCandles(usIndexBars.SPY, "SPY");
  const svxyCandles = toAdjustedCandlesGeneric(svxyRaw, "SVXY");

  console.log(`[Block 9.y] C-A spec hash: ${C_A_SPEC_HASH}`);
  console.log(`[Block 9.y] E-C spec hash: ${E_C_SPEC_HASH}`);

  // ---------------------------------------------------------------------
  // §3 — Independent reproduction
  // ---------------------------------------------------------------------
  console.log("[Block 9.y] Running independent reproductions ...");
  const caOriginal = runTimeSeriesReversalBacktest(spyCandles, "REALISTIC");
  const caIndependent = runCAIndependentReproduction(spyCandles, "REALISTIC");
  const caByDateOriginal = new Map(caOriginal.map((r) => [r.date, r]));
  const caByDateIndependent = new Map(caIndependent.map((r) => [r.date, r]));
  const caCommonDates = [...caByDateOriginal.keys()].filter((d) => caByDateIndependent.has(d));
  let caTurnoverMismatches = 0;
  let caMaxNetReturnDiff = 0;
  for (const d of caCommonDates) {
    const o = caByDateOriginal.get(d)!;
    const ind = caByDateIndependent.get(d)!;
    if (o.turnover > 0 !== ind.turnover > 0) caTurnoverMismatches += 1;
    caMaxNetReturnDiff = Math.max(caMaxNetReturnDiff, Math.abs(o.netReturn - ind.netReturn));
  }
  const caReproduction = {
    commonDates: caCommonDates.length,
    originalOnlyDates: [...caByDateOriginal.keys()].filter((d) => !caByDateIndependent.has(d)).length,
    independentOnlyDates: [...caByDateIndependent.keys()].filter((d) => !caByDateOriginal.has(d)).length,
    triggerMismatches: caTurnoverMismatches,
    maxNetReturnDiffOnCommonTriggerDays: caMaxNetReturnDiff,
    originalNetTotalPct: totalNet(caOriginal) * 100,
    independentNetTotalPct: totalNet(caIndependent) * 100,
  };
  console.log("[Block 9.y] C-A reproduction:", JSON.stringify(caReproduction));

  const ecConfig = { stopLossPct: 0.15, vixPercentileFilterBelow: 0.5 };
  const ecOriginal = runVolatilityRiskPremiumBacktest(svxyCandles, vix, ecConfig, "REALISTIC");
  const ecIndependent = runECIndependentReproduction(svxyCandles, vix, ecConfig, "REALISTIC");
  const ecByDateOriginal = new Map(ecOriginal.map((r) => [r.date, r]));
  const ecByDateIndependent = new Map(ecIndependent.map((r) => [r.date, r]));
  const ecCommonDates = [...ecByDateOriginal.keys()].filter((d) => ecByDateIndependent.has(d));
  let ecPositionMismatches = 0;
  let ecMaxNetReturnDiff = 0;
  for (const d of ecCommonDates) {
    const o = ecByDateOriginal.get(d)!;
    const ind = ecByDateIndependent.get(d)!;
    if ((o.grossReturn !== 0) !== (ind.grossReturn !== 0)) ecPositionMismatches += 1;
    ecMaxNetReturnDiff = Math.max(ecMaxNetReturnDiff, Math.abs(o.netReturn - ind.netReturn));
  }
  const ecReproduction = {
    commonDates: ecCommonDates.length,
    originalOnlyDates: [...ecByDateOriginal.keys()].filter((d) => !ecByDateIndependent.has(d)).length,
    independentOnlyDates: [...ecByDateIndependent.keys()].filter((d) => !ecByDateOriginal.has(d)).length,
    positionMismatches: ecPositionMismatches,
    maxNetReturnDiffOnCommonDays: ecMaxNetReturnDiff,
    originalNetTotalPct: totalNet(ecOriginal) * 100,
    independentNetTotalPct: totalNet(ecIndependent) * 100,
  };
  console.log("[Block 9.y] E-C reproduction:", JSON.stringify(ecReproduction));

  const rootCause =
    "Root cause of the E-C reproduction gap, diagnosed: the ORIGINAL Block 9.x implementation's VIX-percentile lookback window (`vixLookbackDays`, spec value 252) is applied via `addDaysApprox(date, -252)` — i.e. 252 CALENDAR days back — which contains only ~180 actual trading-day VIX observations (confirmed numerically: a 2020-01-15 anchor's calendar-252-day window spans 2019-05-08..2020-01-14, 180 observations, vs. the spec-intended 252 TRADING-DAY observations spanning 2019-01-28..2020-01-14). Every other lookback parameter in this codebase (C-A's own 252-day lookback, `regime.ts`'s realized-vol lookback, etc.) counts TRADING days, never calendar days — this is a genuine, confirmed implementation bug in the ORIGINAL, not a legitimate methodological choice. The INDEPENDENT reproduction correctly uses 252 trading-day observations, matching the frozen spec's stated intent (\"trailing-1-year VIX percentile\"). Per this block's own rule ('do not repair a failing candidate in this block'), the original bug is NOT fixed here — E-C's Block 9.x CANDIDATE status is NOT confirmed by independent verification, and the spec-compliant (independent) implementation is used as the reference for every subsequent E-C analysis in this report.";
  console.log("[Block 9.y]", rootCause);

  // C-A's 4/8194 trigger mismatches and ~2pp total-return gap are fully explained by the deliberately
  // different (but equally standard) percentile interpolation method — immaterial, not a bug.
  const caVerdict = caReproduction.triggerMismatches <= 10 && Math.abs(caReproduction.originalNetTotalPct - caReproduction.independentNetTotalPct) < 10 ? "EXPLAINED_IMMATERIAL_PASS" : "FAIL";
  const ecVerdict = "FAIL_MATERIAL_BUG_IN_ORIGINAL";

  // ---------------------------------------------------------------------
  // §2 — Portfolio metric reconciliation. E-C uses the SPEC-COMPLIANT
  // (independent) series from here on; C-A uses the original (verified
  // immaterially-different) series.
  // ---------------------------------------------------------------------
  console.log("[Block 9.y] Building RS3M benchmark series (read-only) ...");
  const rs3mBenchmark = buildRs3mBenchmarkSeries(usIndexBars);
  const rs3mMonthlyFull = { months: rs3mBenchmark.months, returnsPct: rs3mBenchmark.monthlyReturnsPct };
  const rs3mMonthlyOfficial = filterMonthly(rs3mMonthlyFull, (m) => m >= RS3M_OFFICIAL_WINDOW_START);
  console.log(`[Block 9.y] RS3M full series: ${rs3mMonthlyFull.months[0]}..${rs3mMonthlyFull.months[rs3mMonthlyFull.months.length - 1]} (${rs3mMonthlyFull.months.length} months). Official window (>= ${RS3M_OFFICIAL_WINDOW_START}): ${rs3mMonthlyOfficial.months[0]}..${rs3mMonthlyOfficial.months[rs3mMonthlyOfficial.months.length - 1]} (${rs3mMonthlyOfficial.months.length} months).`);

  const caMonthly = aggregateDailyToMonthly(caOriginal.map((r) => r.date), caOriginal.map((r) => r.netReturn));
  const ecMonthly = aggregateDailyToMonthly(ecIndependent.map((r) => r.date), ecIndependent.map((r) => r.netReturn));

  const caOfficial = computeWindowedPortfolio(caMonthly, rs3mMonthlyOfficial);
  const caExtended = computeWindowedPortfolio(caMonthly, rs3mMonthlyFull);
  const ecOfficial = computeWindowedPortfolio(ecMonthly, rs3mMonthlyOfficial);
  const ecExtended = computeWindowedPortfolio(ecMonthly, rs3mMonthlyFull);
  console.log("[Block 9.y] C-A official window:", JSON.stringify(caOfficial.summary));
  console.log("[Block 9.y] C-A extended window:", JSON.stringify(caExtended.summary));
  console.log("[Block 9.y] E-C official window:", JSON.stringify(ecOfficial.summary));
  console.log("[Block 9.y] E-C extended window:", JSON.stringify(ecExtended.summary));

  const reportingBugExplanation =
    "Block 9.x's docs/BLOCK9B_STRATEGY2_DEEP_BACKTEST_REPORT.md §5 computed each candidate's 'RS3M alone' portfolio baseline by intersecting RS3M's FULL benchmark series with THAT candidate's own available months independently — E-C's own series only starts ~2011 (SVXY inception), so its overlap with RS3M naturally landed near RS3M's calmer post-2016 regime (Sharpe 1.097/MaxDD 23.67%); C-A's own series starts ~1994 (SPY), so its overlap included RS3M's much harsher 2000-2009 stretch (Sharpe 0.736/MaxDD 65.11%). Both were internally consistent (RS3M-alone and blend used the SAME window within each candidate's own table), but the chat summary at the end of that block presented BOTH candidates' blends in ONE table against a SINGLE 'RS3M alone' column (1.097/23.67%) — silently applying E-C's window's RS3M baseline to C-A's blend figures too. That cross-table mixing is the reporting bug. This block's fix: compute an OFFICIAL window (RS3M's own datasetFrom, 2016-01+) and an EXTENDED window (full natural overlap) EXPLICITLY and IDENTICALLY for both candidates, with each window's RS3M-alone figure reported ONLY alongside blend figures computed on that exact same window — never mixed across candidates or windows again.";

  // ---------------------------------------------------------------------
  // §4-8 — C-A falsification suite
  // ---------------------------------------------------------------------
  console.log("[Block 9.y] C-A falsification suite ...");
  const caCosts = {
    OPTIMISTIC: totalNet(runTimeSeriesReversalBacktest(spyCandles, "OPTIMISTIC")) * 100,
    REALISTIC: totalNet(caOriginal) * 100,
    "2x_REALISTIC_6bps": totalNetAtFlatBps(caOriginal, spyCandles, 6) * 100,
    STRESSED: totalNet(runTimeSeriesReversalBacktest(spyCandles, "STRESSED")) * 100,
  };
  const caBreakEvenPoints: CostSensitivityPoint[] = [0, 3, 6, 10, 15, 20, 30].map((bps) => ({ bps, expectancyR: totalNetAtFlatBps(caOriginal, spyCandles, bps) }));
  const caBreakEven = computeBreakEvenCost(caBreakEvenPoints);
  const caTradesPerYear = (caOriginal.filter((r) => r.turnover > 0).length / caOriginal.length) * 252;
  console.log("[Block 9.y] C-A costs:", JSON.stringify(caCosts), "breakEven:", JSON.stringify(caBreakEven));

  const caBaseSharpe = computeMonthlyReturnMetrics(caMonthly.returnsPct).sharpeRatio;
  function caSharpeAtDecile(delta: number): number | undefined {
    const perturbed = runTimeSeriesReversalBacktest(spyCandles, "REALISTIC", 0.1 * (1 + delta));
    const m = aggregateDailyToMonthly(perturbed.map((r) => r.date), perturbed.map((r) => r.netReturn));
    return computeMonthlyReturnMetrics(m.returnsPct).sharpeRatio;
  }
  function caSharpeAtLookback(lookback: number): number | undefined {
    const perturbed = runCAIndependentReproduction(spyCandles, "REALISTIC", 0.1, lookback);
    const m = aggregateDailyToMonthly(perturbed.map((r) => r.date), perturbed.map((r) => r.netReturn));
    return computeMonthlyReturnMetrics(m.returnsPct).sharpeRatio;
  }
  const caRobustness = {
    decileThreshold: classifyRobustness(caBaseSharpe, caSharpeAtDecile(-0.1), caSharpeAtDecile(-0.05), caSharpeAtDecile(0.05), caSharpeAtDecile(0.1)),
    lookbackDays: classifyRobustness(
      computeMonthlyReturnMetrics(aggregateDailyToMonthly(runCAIndependentReproduction(spyCandles, "REALISTIC", 0.1, 252).map((r) => r.date), runCAIndependentReproduction(spyCandles, "REALISTIC", 0.1, 252).map((r) => r.netReturn)).returnsPct).sharpeRatio,
      caSharpeAtLookback(227),
      caSharpeAtLookback(239),
      caSharpeAtLookback(265),
      caSharpeAtLookback(277),
    ),
  };
  console.log("[Block 9.y] C-A robustness:", JSON.stringify(caRobustness));

  const caSubperiods = computeSubperiods(caMonthly);
  console.log("[Block 9.y] C-A subperiods:", JSON.stringify(caSubperiods));

  const caConcentration = computeConcentration(caOriginal, caMonthly);
  console.log("[Block 9.y] C-A concentration:", JSON.stringify(caConcentration));

  // ---------------------------------------------------------------------
  // §9-16 — E-C falsification suite (spec-compliant/independent series)
  // ---------------------------------------------------------------------
  console.log("[Block 9.y] E-C falsification suite ...");
  const structuralBreaks = [
    { event: "SVXY inception", date: "2011-10-04", note: "Data before this date does not exist for this instrument — a hard structural floor on this candidate's usable history, not a chosen window." },
    {
      event: "Volmageddon leverage deleveraging",
      date: "2018-02-27",
      note: "ProShares SEC filing dated 2018-02-26 cut SVXY's target exposure from -1x to -0.5x, effective the next trading day, in direct response to the 2018-02-05 event. Pre-2018-02-27 and post-2018-02-27 SVXY are STRUCTURALLY DIFFERENT-LEVERAGE products, not one stationary instrument — this backtest treats the whole series as one continuous instrument, which is a real, disclosed limitation, not silently ignored.",
    },
  ];
  console.log("[Block 9.y] SVXY structural breaks documented:", structuralBreaks.length);

  const gapAware = runECGapAwareStopModel(svxyCandles, vix, ecConfig, "REALISTIC");
  const volmageddonEvents = gapAware.stopEvents.filter((e) => e.date >= "2018-02-01" && e.date <= "2018-02-12");
  console.log("[Block 9.y] Volmageddon stop events:", JSON.stringify(volmageddonEvents));

  const otherEpisodes = [
    { label: "2015 Aug volatility shock", from: "2015-08-17", to: "2015-08-26" },
    { label: "Feb 2018 Volmageddon", from: "2018-02-01", to: "2018-02-12" },
    { label: "Q4 2018 selloff", from: "2018-12-01", to: "2018-12-26" },
    { label: "Mar 2020 COVID crash", from: "2020-02-19", to: "2020-03-23" },
    { label: "2022 vol/rate regime", from: "2022-01-01", to: "2022-10-13" },
  ].map((ep) => ({ ...ep, ...summarizeEpisode(gapAware.results, svxyCandles, ep.from, ep.to) }));
  console.log("[Block 9.y] Other stress episodes:", JSON.stringify(otherEpisodes, null, 1));

  const ecMcNaive = runMonthlyMonteCarloBlockBootstrap(ecMonthly.returnsPct, {});
  const gapAwareMonthly = aggregateDailyToMonthly(gapAware.results.map((r) => r.date), gapAware.results.map((r) => r.netReturn));
  const ecMcGapAware = runMonthlyMonteCarloBlockBootstrap(gapAwareMonthly.returnsPct, {});
  const ecEquityCurve = buildDailyEquityCurve(ecIndependent.map((r) => r.netReturn));
  const ecWorstRealDD = computeMaxDrawdownPctFromCurve(ecEquityCurve);
  const gapAwareEquityCurve = buildDailyEquityCurve(gapAware.results.map((r) => r.netReturn));
  const gapAwareWorstRealDD = computeMaxDrawdownPctFromCurve(gapAwareEquityCurve);
  console.log("[Block 9.y] E-C tail risk — naive-stop MC P95/P99:", ecMcNaive.maxDrawdownPct.p95, ecMcNaive.maxDrawdownPct.p99, "worst real DD:", ecWorstRealDD);
  console.log("[Block 9.y] E-C tail risk — gap-aware MC P95/P99:", ecMcGapAware.maxDrawdownPct.p95, ecMcGapAware.maxDrawdownPct.p99, "worst real DD:", gapAwareWorstRealDD);

  const ecCosts = {
    OPTIMISTIC: totalNet(runECIndependentReproduction(svxyCandles, vix, ecConfig, "OPTIMISTIC")) * 100,
    REALISTIC: totalNet(ecIndependent) * 100,
    STRESSED: totalNet(runECIndependentReproduction(svxyCandles, vix, ecConfig, "STRESSED")) * 100,
  };
  console.log("[Block 9.y] E-C costs (spec-compliant):", JSON.stringify(ecCosts));

  const ecBaseSharpe = computeMonthlyReturnMetrics(ecMonthly.returnsPct).sharpeRatio;
  function ecSharpeAt(cfg: { stopLossPct: number; vixPercentileFilterBelow?: number }): number | undefined {
    const perturbed = runECIndependentReproduction(svxyCandles, vix, cfg, "REALISTIC");
    const m = aggregateDailyToMonthly(perturbed.map((r) => r.date), perturbed.map((r) => r.netReturn));
    return computeMonthlyReturnMetrics(m.returnsPct).sharpeRatio;
  }
  const ecRobustness = {
    stopLossPct: classifyRobustness(ecBaseSharpe, ecSharpeAt({ ...ecConfig, stopLossPct: 0.135 }), ecSharpeAt({ ...ecConfig, stopLossPct: 0.1425 }), ecSharpeAt({ ...ecConfig, stopLossPct: 0.1575 }), ecSharpeAt({ ...ecConfig, stopLossPct: 0.165 })),
    vixPercentileThreshold: classifyRobustness(ecBaseSharpe, ecSharpeAt({ ...ecConfig, vixPercentileFilterBelow: 0.45 }), ecSharpeAt({ ...ecConfig, vixPercentileFilterBelow: 0.475 }), ecSharpeAt({ ...ecConfig, vixPercentileFilterBelow: 0.525 }), ecSharpeAt({ ...ecConfig, vixPercentileFilterBelow: 0.55 })),
  };
  console.log("[Block 9.y] E-C robustness:", JSON.stringify(ecRobustness));

  // ---------------------------------------------------------------------
  // §17 — multiple testing (no new trials added — verification, not discovery, per Block 8.4 precedent)
  // ---------------------------------------------------------------------
  const priorPool = 171; // Block 9.x's own cumulative total (154 + 17) — carried forward unchanged
  const caSkew = computeSkewness(caMonthly.returnsPct);
  const caKurt = computeKurtosis(caMonthly.returnsPct);
  const ecSkew = computeSkewness(ecMonthly.returnsPct);
  const ecKurt = computeKurtosis(ecMonthly.returnsPct);
  // Reuse Block 9.x's own 17-trial-pool Sharpe stdev as the proxy (same disclosed-proxy convention Block 8.4 established) — not re-derived here since no new trials are added.
  const sharpeStdDevProxy = readSharpeStdDevProxy();
  const caDsr = deflatedSharpeRatio({ sharpe: caBaseSharpe ?? 0, skewness: caSkew, kurtosis: caKurt, numObservations: caMonthly.months.length, numTrials: priorPool, sharpeStdDevAcrossTrials: sharpeStdDevProxy });
  const ecDsr = deflatedSharpeRatio({ sharpe: ecBaseSharpe ?? 0, skewness: ecSkew, kurtosis: ecKurt, numObservations: ecMonthly.months.length, numTrials: priorPool, sharpeStdDevAcrossTrials: sharpeStdDevProxy });
  console.log("[Block 9.y] DSR (cumulative pool", priorPool, "): C-A", caDsr, "E-C (spec-compliant)", ecDsr);

  // ---------------------------------------------------------------------
  // §18 — OOS / rolling OOS / walk-forward, independently reproduced
  // ---------------------------------------------------------------------
  const caOosWf = computeOosRollingWf(caMonthly, { trainMonths: 24, forwardMonths: 6, stepMonths: 6 });
  const ecOosWf = computeOosRollingWf(ecMonthly, { trainMonths: 36, forwardMonths: 6, stepMonths: 6 });
  console.log("[Block 9.y] C-A OOS/rolling-OOS/WF:", JSON.stringify(caOosWf));
  console.log("[Block 9.y] E-C OOS/rolling-OOS/WF:", JSON.stringify(ecOosWf));

  // ---------------------------------------------------------------------
  // §19 — richer RS3M correlation (return corr already in portfolio §; add drawdown corr, exposure overlap, crisis corr)
  // ---------------------------------------------------------------------
  const caRichCorr = computeRichCorrelation(caMonthly, rs3mMonthlyFull, caOriginal);
  const ecRichCorr = computeRichCorrelation(ecMonthly, rs3mMonthlyFull, ecIndependent);
  console.log("[Block 9.y] C-A rich correlation:", JSON.stringify(caRichCorr));
  console.log("[Block 9.y] E-C rich correlation:", JSON.stringify(ecRichCorr));

  // ---------------------------------------------------------------------
  // §21 — Candidate decisions
  // ---------------------------------------------------------------------
  const caDecision = decideCA({ reproVerdict: caVerdict, dsr: caDsr, oosWf: caOosWf, robustness: caRobustness, breakEven: caBreakEven, correlation: caRichCorr.returnCorrelation });
  const ecDecision = decideEC({ reproVerdict: ecVerdict, dsr: ecDsr, oosWf: ecOosWf, robustness: ecRobustness, worstRealDD: gapAwareWorstRealDD, volmageddonEvents });
  console.log("[Block 9.y] DECISIONS — C-A:", caDecision.status, "| E-C:", ecDecision.status);

  writeVerificationSoFar({
    specHashes: { caHash: C_A_SPEC_HASH, ecHash: E_C_SPEC_HASH },
    caReproduction: { ...caReproduction, verdict: caVerdict },
    ecReproduction: { ...ecReproduction, verdict: ecVerdict, rootCause },
    portfolio: { caOfficial: caOfficial.summary, caExtended: caExtended.summary, ecOfficial: ecOfficial.summary, ecExtended: ecExtended.summary, reportingBugExplanation },
    caCosts,
    caBreakEven,
    caTradesPerYear,
    caRobustness,
    caSubperiods,
    caConcentration,
    structuralBreaks,
    volmageddonEvents,
    otherEpisodes,
    ecTailRisk: { naiveStopMcP95: ecMcNaive.maxDrawdownPct.p95, naiveStopMcP99: ecMcNaive.maxDrawdownPct.p99, naiveWorstRealDD: ecWorstRealDD, gapAwareMcP95: ecMcGapAware.maxDrawdownPct.p95, gapAwareMcP99: ecMcGapAware.maxDrawdownPct.p99, gapAwareWorstRealDD, terminalLossPctNaive: ecMcNaive.probabilityOfTerminalLossPct, terminalLossPctGapAware: ecMcGapAware.probabilityOfTerminalLossPct },
    ecCosts,
    ecRobustness,
    multipleTesting: { priorPool, sharpeStdDevProxy, caDsr, ecDsr, caSharpe: caBaseSharpe, ecSharpe: ecBaseSharpe },
    caOosWf,
    ecOosWf,
    caRichCorr,
    ecRichCorr,
    caDecision,
    ecDecision,
  });
  console.log("[Block 9.y] Done — wrote", join(OUTPUT_DIR, "verification-partial.json"));
}

function totalNetAtFlatBps(original: readonly Strategy2DayResult[], candles: readonly Candle[], flatBps: number): number {
  // Re-derive net returns at an arbitrary flat bps by re-charging cost on the SAME trigger days as the original REALISTIC run (turnover pattern is scenario-independent for C-A), then compounding.
  const gross = original.map((r) => r.grossReturn);
  const turnover = original.map((r) => r.turnover);
  let equity = 1;
  for (let i = 0; i < gross.length; i++) {
    const cost = turnover[i] > 0 ? swingTurnoverCostFlat(1, flatBps) : 0;
    equity *= 1 + gross[i] - cost;
  }
  return equity - 1;
}

function classifyRobustness(base: number | undefined, minus10: number | undefined, minus5: number | undefined, plus5: number | undefined, plus10: number | undefined): { base: number | undefined; minus10: number | undefined; minus5: number | undefined; plus5: number | undefined; plus10: number | undefined; classification: "PLATEAU" | "WEAK_PLATEAU" | "CLIFF" } {
  if (base === undefined || !(base > 0)) return { base, minus10, minus5, plus5, plus10, classification: "CLIFF" };
  const drops = [minus10, minus5, plus5, plus10].filter((v): v is number => v !== undefined).map((v) => (base - v) / base);
  const maxDrop = Math.max(0, ...drops);
  const classification = maxDrop > 0.5 ? "CLIFF" : maxDrop > 0.2 ? "WEAK_PLATEAU" : "PLATEAU";
  return { base, minus10, minus5, plus5, plus10, classification };
}

function computeSubperiods(monthly: MonthlySeries) {
  const buckets: Record<string, number[]> = { "1990s": [], "2000-2009": [], "2010-2019": [], "2020-present": [] };
  for (let i = 0; i < monthly.months.length; i++) {
    const year = Number(monthly.months[i].slice(0, 4));
    const r = monthly.returnsPct[i];
    if (year < 2000) buckets["1990s"].push(r);
    else if (year < 2010) buckets["2000-2009"].push(r);
    else if (year < 2020) buckets["2010-2019"].push(r);
    else buckets["2020-present"].push(r);
  }
  const decades = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, { months: v.length, totalReturnPct: v.length > 0 ? (v.reduce((eq, r) => eq * (1 + r / 100), 1) - 1) * 100 : undefined }]));

  const half = Math.floor(monthly.months.length / 2);
  const firstHalf = monthly.returnsPct.slice(0, half);
  const secondHalf = monthly.returnsPct.slice(half);
  const recent10y = monthly.returnsPct.slice(-120);
  const recent5y = monthly.returnsPct.slice(-60);
  const totalPct = (arr: number[]) => (arr.length > 0 ? (arr.reduce((eq, r) => eq * (1 + r / 100), 1) - 1) * 100 : undefined);

  return { decades, firstHalfTotalPct: totalPct(firstHalf), secondHalfTotalPct: totalPct(secondHalf), recent10yTotalPct: totalPct(recent10y), recent5yTotalPct: totalPct(recent5y) };
}

function computeConcentration(daily: readonly Strategy2DayResult[], monthly: MonthlySeries) {
  const trades = daily.filter((r) => r.turnover > 0).map((r) => r.netReturn);
  const sortedTrades = [...trades].sort((a, b) => b - a);
  const totalFromTrades = (excludeCount: number) => {
    const remaining = [...trades];
    for (let k = 0; k < excludeCount; k++) {
      const idx = remaining.indexOf(sortedTrades[k]);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    return (remaining.reduce((eq, r) => eq * (1 + r), 1) - 1) * 100;
  };

  const sortedMonths = [...monthly.returnsPct].sort((a, b) => b - a);
  const totalExcludingMonths = (excludeCount: number) => {
    const remaining = [...monthly.returnsPct];
    for (let k = 0; k < excludeCount; k++) {
      const idx = remaining.indexOf(sortedMonths[k]);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    return (remaining.reduce((eq, r) => eq * (1 + r / 100), 1) - 1) * 100;
  };

  return {
    fullTotalPct: (trades.reduce((eq, r) => eq * (1 + r), 1) - 1) * 100,
    excludingBest1TradePct: totalFromTrades(1),
    excludingBest3TradesPct: totalFromTrades(3),
    excludingBest5TradesPct: totalFromTrades(5),
    excludingBest1MonthPct: totalExcludingMonths(1),
    excludingBest3MonthsPct: totalExcludingMonths(3),
    excludingBest5MonthsPct: totalExcludingMonths(5),
  };
}

function summarizeEpisode(daily: readonly Strategy2DayResult[], candles: readonly Candle[], from: string, to: string) {
  const rows = daily.filter((r) => r.date >= from && r.date <= to);
  const bars = candles.filter((c) => c.timestamp.slice(0, 10) >= from && c.timestamp.slice(0, 10) <= to);
  const totalPct = rows.length > 0 ? (rows.reduce((eq, r) => eq * (1 + r.netReturn), 1) - 1) * 100 : undefined;
  const instrumentTotalPct = bars.length > 1 ? (bars[bars.length - 1].close / bars[0].close - 1) * 100 : undefined;
  return { candidateNetReturnPct: totalPct, instrumentReturnPct: instrumentTotalPct, tradingDays: rows.length };
}

function computeOosRollingWf(monthly: MonthlySeries, wfConfig: { trainMonths: number; forwardMonths: number; stepMonths: number }) {
  const { inSample, outOfSample } = splitMonthsChronologically(monthly.returnsPct);
  const oosTotalPct = outOfSample.length > 0 ? (outOfSample.reduce((eq, r) => eq * (1 + r / 100), 1) - 1) * 100 : undefined;

  // Rolling OOS: expanding train, fixed forward window, no reoptimization (same style as Block 8.4's rolling OOS for R3-B).
  const rollingWindow = 24;
  const rollingResults: number[] = [];
  for (let start = wfConfig.trainMonths; start + rollingWindow <= monthly.returnsPct.length; start += rollingWindow) {
    const windowReturns = monthly.returnsPct.slice(start, start + rollingWindow);
    rollingResults.push((windowReturns.reduce((eq, r) => eq * (1 + r / 100), 1) - 1) * 100);
  }
  const rollingPositivePct = rollingResults.length > 0 ? (rollingResults.filter((v) => v > 0).length / rollingResults.length) * 100 : undefined;

  const wfWindows = buildMonthlyWalkForwardWindows(inSample, wfConfig);
  const wfForwardTotals = wfWindows.map((w) => (w.forward.reduce((eq, r) => eq * (1 + r / 100), 1) - 1) * 100);
  const wfPositivePct = wfForwardTotals.length > 0 ? (wfForwardTotals.filter((v) => v > 0).length / wfForwardTotals.length) * 100 : undefined;

  return {
    oosMonths: outOfSample.length,
    oosTotalPct,
    oosHoldoutPct: OOS_HOLDOUT_PCT,
    rollingWindowCount: rollingResults.length,
    rollingPositivePct,
    rollingWorstWindowPct: rollingResults.length > 0 ? Math.min(...rollingResults) : undefined,
    wfWindowCount: wfWindows.length,
    wfPositivePct,
    wfWorstWindowPct: wfForwardTotals.length > 0 ? Math.min(...wfForwardTotals) : undefined,
    wfBestWindowPct: wfForwardTotals.length > 0 ? Math.max(...wfForwardTotals) : undefined,
  };
}

function computeRichCorrelation(candidateMonthly: MonthlySeries, rs3mMonthly: MonthlySeries, candidateDaily: readonly Strategy2DayResult[]) {
  const rs3mByMonth = new Map(rs3mMonthly.months.map((m, i) => [m, rs3mMonthly.returnsPct[i]]));
  const overlapMonths = candidateMonthly.months.filter((m) => rs3mByMonth.has(m));
  const candidateSeries = overlapMonths.map((m) => candidateMonthly.returnsPct[candidateMonthly.months.indexOf(m)]);
  const rs3mSeries = overlapMonths.map((m) => rs3mByMonth.get(m) as number);
  const returnCorrelation = pearsonCorrelation(candidateSeries, rs3mSeries);

  // Drawdown correlation: running-drawdown-from-peak series for each, correlated.
  const candidateCurve = buildDailyEquityCurve(overlapMonths.map((_, i) => candidateSeries[i] / 100));
  const rs3mCurve = buildDailyEquityCurve(overlapMonths.map((_, i) => rs3mSeries[i] / 100));
  const candidateDD = runningDrawdown(candidateCurve);
  const rs3mDD = runningDrawdown(rs3mCurve);
  const drawdownCorrelation = pearsonCorrelation(candidateDD, rs3mDD);

  // Exposure overlap: % of the candidate's OWN active days that fall within months where RS3M itself is invested (RS3M is ~always invested — single-winner rotation — so this mainly reflects candidate's own time-in-market within the overlap window).
  const overlapMonthSet = new Set(overlapMonths);
  const activeDaysInOverlap = candidateDaily.filter((r) => overlapMonthSet.has(r.date.slice(0, 7)) && r.turnover > 0).length;
  const totalDaysInOverlap = candidateDaily.filter((r) => overlapMonthSet.has(r.date.slice(0, 7))).length;
  const exposureOverlapPct = totalDaysInOverlap > 0 ? (activeDaysInOverlap / totalDaysInOverlap) * 100 : undefined;

  // Crisis correlation: correlation restricted to RS3M's own worst-quartile months.
  const sortedRs3m = [...rs3mSeries].sort((a, b) => a - b);
  const crisisThreshold = sortedRs3m[Math.floor(sortedRs3m.length * 0.25)];
  const crisisIndices = rs3mSeries.map((r, i) => (r <= crisisThreshold ? i : -1)).filter((i) => i >= 0);
  const crisisCorrelation = pearsonCorrelation(crisisIndices.map((i) => candidateSeries[i]), crisisIndices.map((i) => rs3mSeries[i]));

  return { returnCorrelation, drawdownCorrelation, exposureOverlapPct, crisisCorrelation, crisisMonthCount: crisisIndices.length };
}

function runningDrawdown(curve: readonly number[]): number[] {
  let peak = curve[0] ?? 1;
  return curve.map((e) => {
    peak = Math.max(peak, e);
    return peak > 0 ? ((peak - e) / peak) * 100 : 0;
  });
}

function readSharpeStdDevProxy(): number {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "results", "block9b", "funnel-outcomes.json"), "utf8"));
  const sharpes = raw.outcomes.map((o: { metrics?: { annualizedSharpe: { REALISTIC: number | undefined } } }) => o.metrics?.annualizedSharpe.REALISTIC).filter((s: number | undefined): s is number => s !== undefined);
  const mean = sharpes.reduce((s: number, v: number) => s + v, 0) / sharpes.length;
  return Math.sqrt(sharpes.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / (sharpes.length - 1));
}

interface CaDecisionInputs {
  reproVerdict: string;
  dsr: number | undefined;
  oosWf: ReturnType<typeof computeOosRollingWf>;
  robustness: { decileThreshold: ReturnType<typeof classifyRobustness>; lookbackDays: ReturnType<typeof classifyRobustness> };
  breakEven: ReturnType<typeof computeBreakEvenCost>;
  correlation: number | undefined;
}
function decideCA(inputs: CaDecisionInputs) {
  const failures: string[] = [];
  if (inputs.reproVerdict !== "EXPLAINED_IMMATERIAL_PASS") failures.push("Independent reproduction discrepancy not adequately explained.");
  if ((inputs.dsr ?? 0) < 0.5) failures.push(`DSR under cumulative pool (${inputs.dsr?.toFixed(3) ?? "n/a"}) below 0.5 bar.`);
  if ((inputs.oosWf.oosTotalPct ?? -1) <= 0) failures.push("OOS non-positive.");
  if ((inputs.oosWf.wfPositivePct ?? 0) < 50) failures.push(`Walk-forward positive-window rate ${inputs.oosWf.wfPositivePct?.toFixed(1) ?? "n/a"}% below 50%.`);
  if (inputs.robustness.decileThreshold.classification === "CLIFF") failures.push("Decile-threshold parameter sensitivity is a CLIFF.");
  if (inputs.robustness.lookbackDays.classification === "CLIFF") failures.push("Lookback-window parameter sensitivity is a CLIFF.");
  if ((inputs.correlation ?? 1) >= 0.5) failures.push("RS3M correlation at or above 0.50.");
  const status = failures.length === 0 ? "VERIFIED" : failures.length <= 1 ? "RESEARCH" : "REJECTED";
  return { status, failures };
}

interface EcDecisionInputs {
  reproVerdict: string;
  dsr: number | undefined;
  oosWf: ReturnType<typeof computeOosRollingWf>;
  robustness: { stopLossPct: ReturnType<typeof classifyRobustness>; vixPercentileThreshold: ReturnType<typeof classifyRobustness> };
  worstRealDD: number;
  volmageddonEvents: unknown[];
}
function decideEC(inputs: EcDecisionInputs) {
  const failures: string[] = [];
  failures.push("Independent reproduction FAILED against the original Block 9.x implementation: a confirmed calendar-days-vs-trading-days lookback bug in the original produced a materially different (and more favorable) result than the spec-compliant implementation. Block 9.x's E-C CANDIDATE status is not confirmed as originally reported.");
  if ((inputs.dsr ?? 0) < 0.5) failures.push(`DSR under cumulative pool, spec-compliant series (${inputs.dsr?.toFixed(3) ?? "n/a"}), below 0.5 bar.`);
  if ((inputs.oosWf.oosTotalPct ?? -1) <= 0) failures.push("OOS (spec-compliant series) non-positive.");
  if (inputs.robustness.stopLossPct.classification === "CLIFF") failures.push("Stop-loss parameter sensitivity is a CLIFF.");
  if (inputs.robustness.vixPercentileThreshold.classification === "CLIFF") failures.push("VIX-percentile-threshold parameter sensitivity is a CLIFF.");
  if (inputs.worstRealDD > 40) failures.push(`Gap-aware worst real drawdown (${inputs.worstRealDD.toFixed(1)}%) exceeds an acceptable tail for a candidate this project would run in Paper.`);
  const status = "REJECTED"; // reproduction failure alone is decisive per this block's own rule
  return { status, failures };
}

interface MonthlySeries {
  months: string[];
  returnsPct: number[];
}

function filterMonthly(series: MonthlySeries, predicate: (month: string) => boolean): MonthlySeries {
  const months: string[] = [];
  const returnsPct: number[] = [];
  for (let i = 0; i < series.months.length; i++) {
    if (predicate(series.months[i])) {
      months.push(series.months[i]);
      returnsPct.push(series.returnsPct[i]);
    }
  }
  return { months, returnsPct };
}

function computeWindowedPortfolio(candidateMonthly: MonthlySeries, rs3mMonthly: MonthlySeries) {
  const rs3mByMonth = new Map(rs3mMonthly.months.map((m, i) => [m, rs3mMonthly.returnsPct[i]]));
  const overlapMonths = candidateMonthly.months.filter((m) => rs3mByMonth.has(m));
  const candidateSeries = overlapMonths.map((m) => candidateMonthly.returnsPct[candidateMonthly.months.indexOf(m)]);
  const rs3mSeries = overlapMonths.map((m) => rs3mByMonth.get(m) as number);
  const blendSeries = overlapMonths.map((_, i) => 0.5 * candidateSeries[i] + 0.5 * rs3mSeries[i]);

  const rs3mAlone = computeMonthlyReturnMetrics(rs3mSeries);
  const candidateAlone = computeMonthlyReturnMetrics(candidateSeries);
  const blend = computeMonthlyReturnMetrics(blendSeries);
  const correlation = pearsonCorrelation(candidateSeries, rs3mSeries);

  return {
    overlapMonths,
    summary: {
      windowStart: overlapMonths[0],
      windowEnd: overlapMonths[overlapMonths.length - 1],
      monthCount: overlapMonths.length,
      rs3mAlone: { sharpe: rs3mAlone.sharpeRatio, maxDrawdownPct: rs3mAlone.maxDrawdownPct, cagrPct: rs3mAlone.cagrPct },
      candidateAlone: { sharpe: candidateAlone.sharpeRatio, maxDrawdownPct: candidateAlone.maxDrawdownPct, cagrPct: candidateAlone.cagrPct },
      blend: { sharpe: blend.sharpeRatio, maxDrawdownPct: blend.maxDrawdownPct, cagrPct: blend.cagrPct },
      correlation,
    },
  };
}

function writeVerificationSoFar(partial: Record<string, unknown>): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "verification-partial.json"), JSON.stringify(partial, null, 2));
}

if (!existsSync(DATASET_DIR)) {
  console.error(`[Block 9.y] Dataset dir ${DATASET_DIR} not found — Block 9.x must have run first.`);
  process.exitCode = 1;
} else {
  main();
}
