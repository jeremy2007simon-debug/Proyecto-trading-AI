/**
 * Block 8.3 (US Index Top-5 Deep Research) — the 30-experiment funnel
 * across Families 1-5 (6 configs each, exactly the pre-registered
 * budget cap — §2/§7 of the report). Every experimentId, its
 * parameters, and its invalidation criteria are FROZEN here, unedited
 * since the pre-registration commit. Adding a configuration means
 * adding a new experimentId, never editing an existing one after
 * seeing its result.
 *
 * Fail-fast, same discipline as Block 8/8.2: a Stage 4 (realistic NET
 * cost) failure stops that experiment's deeper stages (OOS/walk-
 * forward/Monte Carlo/regime) — never computed for a config that
 * already failed on cost.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/us-index/run-block8-3-funnel.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

import { runMonthlyMonteCarloBlockBootstrap } from "@/core/backtesting/research/monthly-monte-carlo";
import { classifyCostRobustness, computeBreakEvenCost, type CostSensitivityPoint } from "@/core/backtesting/research/break-even-cost";
import { classifyStrategy, type FunnelSummary } from "@/core/backtesting/research/classification";
import { computeMonthlyReturnMetrics, computeCagrFromMonthlyReturns } from "@/core/backtesting/research/portfolio-metrics";
import { deflatedSharpeRatio, computeSkewness, computeKurtosis } from "@/core/backtesting/research/deflated-sharpe";
import { monthlySampleQuality } from "@/core/portfolio-research/classification-adapter";
import { OOS_HOLDOUT_PCT, splitMonthsChronologically } from "@/core/portfolio-research/oos-split";
import { buildMonthlyWalkForwardWindows, DEFAULT_MONTHLY_WALK_FORWARD } from "@/core/portfolio-research/walk-forward";

import { aggregateDailyToMonthly, toAdjustedCandles } from "@/core/us-index-research/daily-series";
import { runVolTargetBacktest, summarizeVolTarget, computeDownsideCapturePct, type VolTargetConfig } from "@/core/us-index-research/vol-target";
import { runTrendPullbackBacktest, type TrendPullbackConfig } from "@/core/us-index-research/trend-pullback";
import { runHybridBacktest, computeHybridAttribution, type HybridConfig } from "@/core/us-index-research/hybrid";
import { runCrossIndexRotationBacktest, type CrossIndexRotationConfig } from "@/core/us-index-research/cross-index-rotation";
import { runIntradayMomentumBacktest, summarizeIntradayTrades, type IntradayMomentumConfig } from "@/core/us-index-research/intraday-momentum";
import { buildRs3mBenchmarkSeries } from "@/core/us-index-research/rs3m-benchmark";
import { classifyCorrelationVsRs3m } from "@/core/us-index-research/portfolio-vs-rs3m";
import { buildMonthlyRegimeLabels, computeRegimeBucketBreakdown, countPositiveUsIndexRegimes } from "@/core/us-index-research/regime-breakdown";
import type { CostScenario } from "@/core/us-index-research/cost-model";
import type { UsIndexDailyBar, UsIndexIntradayBar, UsIndexMarket } from "@/core/us-index-research/types";

const DATASETS_DAILY_DIR = join(process.cwd(), "results", "block8-3", "datasets", "daily");
const DATASETS_INTRADAY_DIR = join(process.cwd(), "results", "block8-3", "datasets", "intraday");
const OUTPUT_DIR = join(process.cwd(), "results", "block8-3", "experiments");
const MIN_SANITY_MONTHS = 36;
const COST_SWEEP_BPS = [0, 1, 2, 3, 5, 8, 12];

function gitCommit(): string | undefined {
  try {
    return execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim();
  } catch {
    return undefined;
  }
}

function loadDailyBars(ticker: UsIndexMarket): UsIndexDailyBar[] {
  return JSON.parse(readFileSync(join(DATASETS_DAILY_DIR, `${ticker}_1d.json`), "utf8"));
}
function loadIntradayBars(ticker: UsIndexMarket, interval: string): UsIndexIntradayBar[] {
  return JSON.parse(readFileSync(join(DATASETS_INTRADAY_DIR, `${ticker}_${interval}.json`), "utf8"));
}

const INVALIDATION_COMMON = [
  "Non-positive NET expectancy at REALISTIC cost.",
  "Break-even cost margin below a defensible safety multiple of the REALISTIC scenario.",
  "OOS or walk-forward-majority failure.",
];

interface MonthlySeriesSet {
  OPTIMISTIC: { months: string[]; returnsPct: number[] };
  REALISTIC: { months: string[]; returnsPct: number[] };
  STRESSED: { months: string[]; returnsPct: number[] };
  costSweep: (bps: number) => { months: string[]; returnsPct: number[] };
}

interface ExperimentDefinition {
  experimentId: string;
  family: string;
  hypothesis: string;
  markets: string[];
  timeframe: string;
  parameters: Record<string, unknown>;
  invalidationCriteria: string[];
  buildMonthlySeries: () => MonthlySeriesSet;
  /** Family-specific supplementary metrics (Family 1's exposure/downside-capture summary, Family 2's per-trade stats, Family 5's momentum/contrarian attribution) recorded in the JSON, never used to gate classification (that stays on the monthly-return series like every other family, for a like-for-like funnel). */
  extraMetrics?: () => Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Family 1: Volatility-Managed Equity Exposure
// ---------------------------------------------------------------------------
function buildFamily1(ticker: UsIndexMarket, config: VolTargetConfig): MonthlySeriesSet {
  const bars = loadDailyBars(ticker);
  const seriesFor = (scenario: CostScenario, flatBps?: number) => {
    const days = runVolTargetBacktest(bars, config, scenario, flatBps);
    return aggregateDailyToMonthly(days.map((d) => d.date), days.map((d) => d.netReturn));
  };
  return {
    OPTIMISTIC: seriesFor("OPTIMISTIC"),
    REALISTIC: seriesFor("REALISTIC"),
    STRESSED: seriesFor("STRESSED"),
    costSweep: (bps) => seriesFor("OPTIMISTIC", bps),
  };
}

// ---------------------------------------------------------------------------
// Family 3: Regime-Dependent Trend/Pullback
// ---------------------------------------------------------------------------
function buildFamily3(ticker: UsIndexMarket, config: TrendPullbackConfig): MonthlySeriesSet {
  const candles = toAdjustedCandles(loadDailyBars(ticker), ticker);
  const seriesFor = (scenario: CostScenario, flatBps?: number) => {
    const days = runTrendPullbackBacktest(candles, config, scenario, flatBps);
    return aggregateDailyToMonthly(days.map((d) => d.date), days.map((d) => d.netReturn));
  };
  return {
    OPTIMISTIC: seriesFor("OPTIMISTIC"),
    REALISTIC: seriesFor("REALISTIC"),
    STRESSED: seriesFor("STRESSED"),
    costSweep: (bps) => seriesFor("OPTIMISTIC", bps),
  };
}

// ---------------------------------------------------------------------------
// Family 5: Hybrid Momentum-Contrarian
// ---------------------------------------------------------------------------
function buildFamily5(ticker: UsIndexMarket, config: HybridConfig): MonthlySeriesSet {
  const candles = toAdjustedCandles(loadDailyBars(ticker), ticker);
  const seriesFor = (scenario: CostScenario, flatBps?: number) => {
    const days = runHybridBacktest(candles, config, scenario, flatBps);
    return aggregateDailyToMonthly(days.map((d) => d.date), days.map((d) => d.netReturn));
  };
  return {
    OPTIMISTIC: seriesFor("OPTIMISTIC"),
    REALISTIC: seriesFor("REALISTIC"),
    STRESSED: seriesFor("STRESSED"),
    costSweep: (bps) => seriesFor("OPTIMISTIC", bps),
  };
}

// ---------------------------------------------------------------------------
// Family 4: Cross-Index Relative Strength / Rotation
// ---------------------------------------------------------------------------
const ALL_TICKERS: UsIndexMarket[] = ["SPY", "QQQ", "IWM", "DIA"];

function buildFamily4(config: CrossIndexRotationConfig): MonthlySeriesSet {
  const assets = ALL_TICKERS.map((market) => ({ market, bars: loadDailyBars(market) }));
  const seriesFor = (scenario: CostScenario, flatBps?: number) => {
    const periods = runCrossIndexRotationBacktest(assets, config, scenario, flatBps);
    return { months: periods.map((p) => p.holdMonth), returnsPct: periods.map((p) => p.netReturn * 100) };
  };
  return {
    OPTIMISTIC: seriesFor("OPTIMISTIC"),
    REALISTIC: seriesFor("REALISTIC"),
    STRESSED: seriesFor("STRESSED"),
    costSweep: (bps) => seriesFor("OPTIMISTIC", bps),
  };
}

// ---------------------------------------------------------------------------
// Family 2: Intraday Momentum (per-trade R-multiples -> monthly return equivalent)
// ---------------------------------------------------------------------------
const INTRADAY_RISK_PER_TRADE_PCT = 1; // documented fixed sizing assumption — see report §7/§11

function buildFamily2(ticker: UsIndexMarket, interval: string, config: IntradayMomentumConfig): { series: MonthlySeriesSet; extra: Record<string, unknown> } {
  const bars = loadIntradayBars(ticker, interval);
  const tradesFor = (scenario: CostScenario) => runIntradayMomentumBacktest(bars, ticker, config, scenario);

  function toMonthly(scenario: CostScenario, useNet: boolean): { months: string[]; returnsPct: number[] } {
    const trades = tradesFor(scenario);
    const byMonth = new Map<string, number>(); // month -> compounded equity multiplier
    for (const t of trades) {
      const month = t.sessionDate.slice(0, 7);
      const r = (useNet ? t.netPnlR : t.pnlR) * (INTRADAY_RISK_PER_TRADE_PCT / 100);
      byMonth.set(month, (byMonth.get(month) ?? 1) * (1 + r));
    }
    const months = [...byMonth.keys()].sort();
    return { months, returnsPct: months.map((m) => (byMonth.get(m)! - 1) * 100) };
  }

  const series: MonthlySeriesSet = {
    OPTIMISTIC: toMonthly("OPTIMISTIC", false),
    REALISTIC: toMonthly("REALISTIC", true),
    STRESSED: toMonthly("STRESSED", true),
    costSweep: (bps) => {
      const trades = tradesFor("OPTIMISTIC");
      const byMonth = new Map<string, number>();
      for (const t of trades) {
        const month = t.sessionDate.slice(0, 7);
        const costR = t.riskPerShare > 0 ? ((bps / 10_000) * t.entryPrice) / t.riskPerShare : 0;
        const r = (t.pnlR - costR) * (INTRADAY_RISK_PER_TRADE_PCT / 100);
        byMonth.set(month, (byMonth.get(month) ?? 1) * (1 + r));
      }
      const months = [...byMonth.keys()].sort();
      return { months, returnsPct: months.map((m) => (byMonth.get(m)! - 1) * 100) };
    },
  };

  const trades = tradesFor("REALISTIC");
  const sessionCount = new Set(loadIntradayBars(ticker, interval).map((b) => b.timestamp.slice(0, 10))).size;
  const summary = summarizeIntradayTrades(trades, sessionCount);
  return {
    series,
    extra: {
      totalTrades: summary.totalTrades,
      tradesPerDay: summary.tradesPerDay,
      winRatePct: summary.winRate,
      averageR: summary.averageR,
      profitFactor: summary.profitFactor,
      expectancyR: summary.expectancyR,
      netExpectancyR: summary.netExpectancyR,
      sessionCount,
      dataWindowNote: interval === "1h" ? "PRIMARY: ~2 years of 1h bars." : "SUPPLEMENTARY/LIMITED: last 60 calendar days only (Yahoo's hard ceiling for sub-hourly intervals) — critical sample-length limitation, not extrapolated.",
    },
  };
}

// ---------------------------------------------------------------------------
// Experiment registry (frozen)
// ---------------------------------------------------------------------------
function buildExperiments(): ExperimentDefinition[] {
  const experiments: ExperimentDefinition[] = [];

  // ---- Family 1: Volatility-Managed Equity Exposure (6) ----
  const f1Configs: { id: string; ticker: UsIndexMarket; targetVolPct: number; volLookbackDays: number; volProxy: "REALIZED" | "ATR" }[] = [
    { id: "V1-A", ticker: "SPY", targetVolPct: 10, volLookbackDays: 20, volProxy: "REALIZED" },
    { id: "V1-B", ticker: "SPY", targetVolPct: 10, volLookbackDays: 63, volProxy: "REALIZED" },
    { id: "V1-C", ticker: "SPY", targetVolPct: 15, volLookbackDays: 20, volProxy: "REALIZED" },
    { id: "V1-D", ticker: "SPY", targetVolPct: 15, volLookbackDays: 63, volProxy: "REALIZED" },
    { id: "V1-E", ticker: "QQQ", targetVolPct: 15, volLookbackDays: 20, volProxy: "REALIZED" },
    { id: "V1-F", ticker: "SPY", targetVolPct: 12, volLookbackDays: 63, volProxy: "ATR" },
  ];
  for (const c of f1Configs) {
    experiments.push({
      experimentId: c.id,
      family: "1: Volatility-Managed Equity Exposure",
      hypothesis: "Scaling exposure (0-100%, long/cash, never leveraged) inversely to trailing realized volatility improves risk-adjusted return vs static buy-and-hold (Moreira & Muir 2017).",
      markets: [c.ticker],
      timeframe: "1d",
      parameters: { targetVolPct: c.targetVolPct, volLookbackDays: c.volLookbackDays, volProxy: c.volProxy, maxExposure: 1 },
      invalidationCriteria: [...INVALIDATION_COMMON, "Drawdown reduction achieved only by destroying CAGR disproportionately (Calmar ratio worse than buy-and-hold)."],
      buildMonthlySeries: () => buildFamily1(c.ticker, { targetVolPct: c.targetVolPct, volLookbackDays: c.volLookbackDays, volProxy: c.volProxy, maxExposure: 1 }),
      extraMetrics: () => {
        const bars = loadDailyBars(c.ticker);
        const days = runVolTargetBacktest(bars, { targetVolPct: c.targetVolPct, volLookbackDays: c.volLookbackDays, volProxy: c.volProxy, maxExposure: 1 }, "REALISTIC");
        const benchmarkDailyReturns = bars.slice(1).map((b, i) => b.adjClose / bars[i].adjClose - 1);
        return { exposureSummary: summarizeVolTarget(days), downsideCapturePct: computeDownsideCapturePct(days.map((d) => d.netReturn), benchmarkDailyReturns.slice(-days.length)) };
      },
    });
  }

  // ---- Family 3: Regime-Dependent Trend/Pullback (6) ----
  const f3Configs: { id: string; ticker: UsIndexMarket; regimeFilterMode: "NONE" | "LONG_TERM_TREND" | "VOL_REGIME" | "BOTH"; entryRsi: number }[] = [
    { id: "R3-A", ticker: "SPY", regimeFilterMode: "NONE", entryRsi: 40 },
    { id: "R3-B", ticker: "SPY", regimeFilterMode: "LONG_TERM_TREND", entryRsi: 40 },
    { id: "R3-C", ticker: "SPY", regimeFilterMode: "VOL_REGIME", entryRsi: 40 },
    { id: "R3-D", ticker: "SPY", regimeFilterMode: "BOTH", entryRsi: 40 },
    { id: "R3-E", ticker: "QQQ", regimeFilterMode: "NONE", entryRsi: 35 },
    { id: "R3-F", ticker: "QQQ", regimeFilterMode: "BOTH", entryRsi: 35 },
  ];
  for (const c of f3Configs) {
    const config: TrendPullbackConfig = { smaTrendPeriod: 50, smaSlopeLookbackDays: 10, rsiPeriod: 14, entryRsiThreshold: c.entryRsi, exitRsiThreshold: 55, maxHoldDays: 20, regimeFilterMode: c.regimeFilterMode };
    experiments.push({
      experimentId: c.id,
      family: "3: Regime-Dependent Trend/Pullback",
      hypothesis: "A pullback-buy-in-uptrend rule (RSI(14) dip-and-resume + rising SMA(50)) performs better, with shallower drawdown, when gated by a long-term-trend and/or realized-vol regime filter than run unconditionally.",
      markets: [c.ticker],
      timeframe: "1d",
      parameters: { ...config },
      invalidationCriteria: [...INVALIDATION_COMMON, "Regime filter fails to improve drawdown/consistency vs. the unfiltered (NONE) baseline for the same ticker."],
      buildMonthlySeries: () => buildFamily3(c.ticker, config),
    });
  }

  // ---- Family 5: Hybrid Momentum-Contrarian (6) ----
  const f5Configs: { id: string; ticker: UsIndexMarket; adxThreshold: number; rsiLow: number; rsiHigh: number }[] = [
    { id: "H5-A", ticker: "SPY", adxThreshold: 20, rsiLow: 30, rsiHigh: 70 },
    { id: "H5-B", ticker: "SPY", adxThreshold: 25, rsiLow: 30, rsiHigh: 70 },
    { id: "H5-C", ticker: "SPY", adxThreshold: 20, rsiLow: 25, rsiHigh: 75 },
    { id: "H5-D", ticker: "SPY", adxThreshold: 25, rsiLow: 25, rsiHigh: 75 },
    { id: "H5-E", ticker: "QQQ", adxThreshold: 20, rsiLow: 30, rsiHigh: 70 },
    { id: "H5-F", ticker: "QQQ", adxThreshold: 25, rsiLow: 25, rsiHigh: 75 },
  ];
  for (const c of f5Configs) {
    const config: HybridConfig = { adxPeriod: 14, adxTrendThreshold: c.adxThreshold, rocLookbackDays: 10, contrarianRsiLow: c.rsiLow, contrarianRsiHigh: c.rsiHigh };
    experiments.push({
      experimentId: c.id,
      family: "5: Hybrid Momentum-Contrarian",
      hypothesis: "A single ex-ante ADX(14) regime switch — momentum (10-day ROC) in TREND_REGIME, RSI(14) mean-reversion in RANGE_REGIME — outperforms either sub-strategy run unconditionally.",
      markets: [c.ticker],
      timeframe: "1d",
      parameters: { ...config },
      invalidationCriteria: [...INVALIDATION_COMMON, "One sub-strategy (momentum or contrarian) explains >80% of total return, contradicting the 'genuine hybrid' premise."],
      buildMonthlySeries: () => buildFamily5(c.ticker, config),
      extraMetrics: () => {
        const candles = toAdjustedCandles(loadDailyBars(c.ticker), c.ticker);
        const days = runHybridBacktest(candles, config, "REALISTIC");
        const attribution = computeHybridAttribution(candles, config, days);
        return { attribution };
      },
    });
  }

  // ---- Family 4: Cross-Index Relative Strength / Rotation (6) ----
  const f4Configs: { id: string; lookbackMonths: number; ranking: "RAW_RETURN" | "RISK_ADJUSTED"; weighting: "SINGLE_WINNER" | "TOP_2_EQUAL_WEIGHT" }[] = [
    { id: "F4-A", lookbackMonths: 1, ranking: "RAW_RETURN", weighting: "SINGLE_WINNER" },
    { id: "F4-B", lookbackMonths: 2, ranking: "RAW_RETURN", weighting: "SINGLE_WINNER" },
    { id: "F4-C", lookbackMonths: 1, ranking: "RISK_ADJUSTED", weighting: "SINGLE_WINNER" },
    { id: "F4-D", lookbackMonths: 1, ranking: "RISK_ADJUSTED", weighting: "TOP_2_EQUAL_WEIGHT" },
    { id: "F4-E", lookbackMonths: 2, ranking: "RISK_ADJUSTED", weighting: "TOP_2_EQUAL_WEIGHT" },
    { id: "F4-F", lookbackMonths: 1, ranking: "RAW_RETURN", weighting: "TOP_2_EQUAL_WEIGHT" },
  ];
  for (const c of f4Configs) {
    const config: CrossIndexRotationConfig = { lookbackMonths: c.lookbackMonths, ranking: c.ranking, weighting: c.weighting };
    experiments.push({
      experimentId: c.id,
      family: "4: Cross-Index Relative Strength/Rotation",
      hypothesis: `Short tactical (${c.lookbackMonths}mo, never RS3M's 3mo) ${c.ranking === "RISK_ADJUSTED" ? "risk-adjusted (return/vol)" : "raw-return"} rotation among SPY/QQQ/IWM/DIA, ${c.weighting === "TOP_2_EQUAL_WEIGHT" ? "blended across the top 2" : "single-winner"}, captures short-horizon relative persistence independently of RS3M's medium-horizon construction.`,
      markets: ALL_TICKERS,
      timeframe: "1mo (rebalance)",
      parameters: { ...config },
      invalidationCriteria: [...INVALIDATION_COMMON, "High correlation with RS3M's own return series (diversification value LOW) despite the different lookback/ranking/weighting."],
      buildMonthlySeries: () => buildFamily4(config),
    });
  }

  // ---- Family 2: Intraday Momentum (6) ----
  const f2Configs: { id: string; ticker: UsIndexMarket; interval: string; moveThreshold: number; atrStop: number; tpR: number }[] = [
    { id: "I2-A", ticker: "SPY", interval: "1h", moveThreshold: 1.0, atrStop: 1.0, tpR: 1.5 },
    { id: "I2-B", ticker: "SPY", interval: "1h", moveThreshold: 0.6, atrStop: 1.0, tpR: 1.5 },
    { id: "I2-C", ticker: "SPY", interval: "1h", moveThreshold: 1.0, atrStop: 1.5, tpR: 2.0 },
    { id: "I2-D", ticker: "SPY", interval: "1h", moveThreshold: 1.5, atrStop: 1.0, tpR: 1.5 },
    { id: "I2-E", ticker: "QQQ", interval: "1h", moveThreshold: 1.0, atrStop: 1.0, tpR: 1.5 },
    { id: "I2-F", ticker: "SPY", interval: "30m", moveThreshold: 1.0, atrStop: 1.0, tpR: 1.5 },
  ];
  for (const c of f2Configs) {
    const config: IntradayMomentumConfig = { openingWindowBars: c.interval === "1h" ? 3 : 6, moveThresholdAtrMultiple: c.moveThreshold, volumeMultiplier: 1.2, atrStopMultiplier: c.atrStop, takeProfitRMultiple: c.tpR };
    const built = buildFamily2(c.ticker, c.interval, config);
    experiments.push({
      experimentId: c.id,
      family: "2: Intraday Momentum",
      hypothesis: "Opening Directional Persistence: an ATR-normalized directional displacement from the session's own open, within the opening window and confirmed by above-average volume, persists through the session (distinct from ORB's fixed-range breakout, VWAP setups, session-momentum's closing window, and gap-continuation's overnight gap).",
      markets: [c.ticker],
      timeframe: c.interval,
      parameters: { ...config, riskPerTradePct: INTRADAY_RISK_PER_TRADE_PCT, flatByClose: true },
      invalidationCriteria: [...INVALIDATION_COMMON, "Sample too short/thin to trust (especially the 30m SUPPLEMENTARY/LIMITED dataset, 60 calendar days only).", "Positive R-multiple expectancy that does not survive INTRADAY realistic cost."],
      buildMonthlySeries: () => built.series,
      extraMetrics: () => built.extra,
    });
  }

  return experiments;
}

// ---------------------------------------------------------------------------
// Shared funnel pipeline (identical machinery for every family, per §14)
// ---------------------------------------------------------------------------
interface ExperimentOutcome {
  experimentId: string;
  family: string;
  classification: string;
  realisticSharpe: number | undefined;
  reachedOos: boolean;
  json: Record<string, unknown>;
}

function runFunnel(exp: ExperimentDefinition, spyBars: readonly UsIndexDailyBar[], rs3mSeries: { months: string[]; monthlyReturnsPct: number[] }): ExperimentOutcome {
  const series = exp.buildMonthlySeries();
  const numMonths = series.REALISTIC.months.length;
  const grossMetrics = computeMonthlyReturnMetrics(series.OPTIMISTIC.returnsPct);
  const sanityPassed = numMonths >= MIN_SANITY_MONTHS && Number.isFinite(grossMetrics.cagrPct ?? NaN);
  const zeroCostExpectancyR = grossMetrics.cagrPct ?? 0;

  const costPoints: CostSensitivityPoint[] = [];
  if (sanityPassed) {
    for (const bps of COST_SWEEP_BPS) {
      const s = bps === 0 ? series.OPTIMISTIC : series.costSweep(bps);
      costPoints.push({ bps, expectancyR: computeMonthlyReturnMetrics(s.returnsPct).cagrPct ?? 0 });
    }
  }
  const breakEven = costPoints.length > 0 ? computeBreakEvenCost(costPoints) : undefined;

  const realisticMetrics = computeMonthlyReturnMetrics(series.REALISTIC.returnsPct);
  const realisticCostExpectancyR = realisticMetrics.cagrPct ?? 0;
  const survivesStage4 = sanityPassed && realisticCostExpectancyR > 0;

  let oosExpectancyR: number | undefined;
  let walkForwardSummary: { positivePct: number; windowCount: number } | undefined;
  let monteCarlo: ReturnType<typeof runMonthlyMonteCarloBlockBootstrap> | undefined;
  let regimeBreakdown: ReturnType<typeof computeRegimeBucketBreakdown> | undefined;
  let longHistorySplit: { firstHalf: number | undefined; secondHalf: number | undefined } | undefined;
  let correlationVsRs3m: ReturnType<typeof classifyCorrelationVsRs3m> | undefined;

  if (survivesStage4) {
    const split = splitMonthsChronologically(series.REALISTIC.returnsPct);
    oosExpectancyR = computeMonthlyReturnMetrics(split.outOfSample).cagrPct ?? 0;

    const inSample = split.inSample;
    const windows = buildMonthlyWalkForwardWindows(inSample, DEFAULT_MONTHLY_WALK_FORWARD);
    const forwardResults = windows.map((w) => computeCagrFromMonthlyReturns(w.forward) ?? 0);
    walkForwardSummary = { positivePct: forwardResults.length > 0 ? (forwardResults.filter((v) => v > 0).length / forwardResults.length) * 100 : 0, windowCount: windows.length };

    const half = Math.floor(inSample.length / 2);
    longHistorySplit = { firstHalf: computeCagrFromMonthlyReturns(inSample.slice(0, half)), secondHalf: computeCagrFromMonthlyReturns(inSample.slice(half)) };

    monteCarlo = runMonthlyMonteCarloBlockBootstrap(series.REALISTIC.returnsPct, { benchmarkMonthlyReturnsPct: undefined });

    const regimeLabels = buildMonthlyRegimeLabels(spyBars, "SPY");
    regimeBreakdown = computeRegimeBucketBreakdown(series.REALISTIC.months, series.REALISTIC.returnsPct, regimeLabels);

    correlationVsRs3m = classifyCorrelationVsRs3m(
      alignByMonth(series.REALISTIC.months, series.REALISTIC.returnsPct, rs3mSeries.months),
      alignByMonth(rs3mSeries.months, rs3mSeries.monthlyReturnsPct, series.REALISTIC.months),
    );
  }

  const summary: FunnelSummary = {
    sanityPassed,
    zeroCostExpectancyR,
    realisticCostExpectancyR,
    breakEvenBps: breakEven?.breakEvenBps ?? null,
    oosExpectancyR,
    walkForwardPositiveWindowPct: walkForwardSummary?.positivePct,
    walkForwardWindowCount: walkForwardSummary?.windowCount ?? 0,
    sampleQuality: monthlySampleQuality(numMonths),
    crossAssetPositiveCount: 0,
    crossAssetTestedCount: 0,
    monteCarloDrawdownP95Pct: monteCarlo?.maxDrawdownPct.p95,
    positiveRegimeCount: regimeBreakdown ? countPositiveUsIndexRegimes(regimeBreakdown) : 0,
  };
  const { classification, reasons } = classifyStrategy(summary);

  const json = {
    experimentId: exp.experimentId,
    family: exp.family,
    hypothesis: exp.hypothesis,
    markets: exp.markets,
    timeframe: exp.timeframe,
    parameters: exp.parameters,
    invalidationCriteria: exp.invalidationCriteria,
    numMonths,
    firstMonth: series.REALISTIC.months[0],
    lastMonth: series.REALISTIC.months[series.REALISTIC.months.length - 1],
    classification,
    reasons,
    grossMetrics,
    costScenarios: { OPTIMISTIC: computeMonthlyReturnMetrics(series.OPTIMISTIC.returnsPct), REALISTIC: realisticMetrics, STRESSED: computeMonthlyReturnMetrics(series.STRESSED.returnsPct) },
    costSensitivity: costPoints,
    breakEven,
    costRobustness: breakEven ? classifyCostRobustness(breakEven) : undefined,
    oosExpectancyR,
    walkForward: walkForwardSummary,
    longHistorySplit,
    monteCarlo,
    regimeBreakdown,
    correlationVsRs3m,
    extraMetrics: exp.extraMetrics?.(),
  };

  return { experimentId: exp.experimentId, family: exp.family, classification, realisticSharpe: realisticMetrics.sharpeRatio, reachedOos: oosExpectancyR !== undefined, json };
}

function alignByMonth(monthsA: readonly string[], returnsA: readonly number[], monthsB: readonly string[]): number[] {
  const mapA = new Map(monthsA.map((m, i) => [m, returnsA[i]]));
  return monthsB.filter((m) => mapA.has(m)).map((m) => mapA.get(m)!);
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const commit = gitCommit();
  const spyBars = loadDailyBars("SPY");
  const barsByTicker: Record<UsIndexMarket, UsIndexDailyBar[]> = { SPY: spyBars, QQQ: loadDailyBars("QQQ"), IWM: loadDailyBars("IWM"), DIA: loadDailyBars("DIA") };
  const rs3mSeries = buildRs3mBenchmarkSeries(barsByTicker);

  const experiments = buildExperiments();
  const outcomes: ExperimentOutcome[] = [];

  for (const exp of experiments) {
    const outputPath = join(OUTPUT_DIR, `${exp.experimentId}.json`);
    console.log(`[Block 8.3] Running ${exp.experimentId} (${exp.family}) ...`);
    const outcome = runFunnel(exp, spyBars, rs3mSeries);
    outcomes.push(outcome);
    writeFileSync(outputPath, JSON.stringify({ ...outcome.json, createdAt: new Date().toISOString(), gitCommit: commit }, null, 2));
    console.log(`[Block 8.3] ${exp.experimentId}: ${outcome.classification}`);
  }

  // Deflated Sharpe Ratio — cross-trial correction, computed ONCE all experiments have run (§20 of the brief), applied only to Stage-7+ (OOS-reaching) survivors.
  //
  // Pooled SEPARATELY by methodology, never across all 30 as one set: Family
  // 2's Sharpe is computed from per-trade R-multiple-derived monthly returns
  // (small sample, high variance, Sharpes as extreme as -3.4) while Families
  // 1/3/4/5 use daily-equity-curve-derived monthly returns over 25-30+ years
  // — mixing the two would inflate the cross-trial Sharpe stdev purely from
  // unit/methodology mismatch, not genuine dispersion of skill, and silently
  // deflate every daily-family DSR toward zero. This is the SAME issue Block
  // 8.2's own §17 documents (that round's Block 8 vs Block 8.2 trial counts)
  // and resolves the same way: compute DSR within each methodology's own
  // trial set, disclose both pool sizes.
  const dailyFamilyOutcomes = outcomes.filter((o) => !o.family.startsWith("2:"));
  const intradayOutcomes = outcomes.filter((o) => o.family.startsWith("2:"));

  function sharpeStdDevOf(pool: readonly ExperimentOutcome[]): number {
    const sharpes = pool.map((o) => o.realisticSharpe).filter((s): s is number => s !== undefined);
    const mean = sharpes.reduce((s, v) => s + v, 0) / (sharpes.length || 1);
    return sharpes.length > 1 ? Math.sqrt(sharpes.reduce((s, v) => s + (v - mean) ** 2, 0) / (sharpes.length - 1)) : 0;
  }
  const dailyFamilySharpeStdDev = sharpeStdDevOf(dailyFamilyOutcomes);
  const intradaySharpeStdDev = sharpeStdDevOf(intradayOutcomes);

  for (const outcome of outcomes) {
    if (!outcome.reachedOos) continue;
    const isIntraday = outcome.family.startsWith("2:");
    const pool = isIntraday ? intradayOutcomes : dailyFamilyOutcomes;
    const sharpeStdDev = isIntraday ? intradaySharpeStdDev : dailyFamilySharpeStdDev;

    const outputPath = join(OUTPUT_DIR, `${outcome.experimentId}.json`);
    const stored = JSON.parse(readFileSync(outputPath, "utf8"));
    // Recompute skew/kurtosis directly from the REALISTIC monthly series for THIS experiment (re-derive rather than re-plumb through `runFunnel`'s return type, keeping its signature simple).
    const exp = experiments.find((e) => e.experimentId === outcome.experimentId)!;
    const series = exp.buildMonthlySeries();
    const skewness = computeSkewness(series.REALISTIC.returnsPct);
    const kurtosis = computeKurtosis(series.REALISTIC.returnsPct);
    const dsr = outcome.realisticSharpe !== undefined
      ? deflatedSharpeRatio({ sharpe: outcome.realisticSharpe, skewness, kurtosis, numObservations: series.REALISTIC.returnsPct.length, numTrials: pool.length, sharpeStdDevAcrossTrials: sharpeStdDev })
      : undefined;
    stored.deflatedSharpeRatio = dsr;
    stored.multipleTestingContext = { numTrialsInPool: pool.length, sharpeStdDevAcrossTrialsInPool: sharpeStdDev, pool: isIntraday ? "INTRADAY (Family 2)" : "DAILY_FAMILIES (1/3/4/5)", totalTrialsThisRound: experiments.length };
    writeFileSync(outputPath, JSON.stringify(stored, null, 2));
  }

  const registryPath = join(OUTPUT_DIR, "_registry.json");
  writeFileSync(registryPath, JSON.stringify({ generatedAt: new Date().toISOString(), gitCommit: commit, oosHoldoutPct: OOS_HOLDOUT_PCT, experiments: outcomes.map((o) => ({ id: o.experimentId, family: o.family, classification: o.classification })) }, null, 2));

  console.log(`\n=== Block 8.3 funnel complete. ${outcomes.length} experiments. Results in ${OUTPUT_DIR} ===`);
  const byClass = new Map<string, number>();
  for (const o of outcomes) byClass.set(o.classification, (byClass.get(o.classification) ?? 0) + 1);
  for (const [c, n] of byClass) console.log(`  ${c}: ${n}`);
}

main().catch((error) => {
  console.error("[block8-3-funnel] Unhandled error:", error);
  process.exitCode = 1;
});
