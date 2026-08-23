/**
 * Block 9.x — Strategy #2 deep backtest. Executes the 20 configurations
 * FROZEN in `docs/BLOCK9_STRATEGY2_PREREGISTRATION.md`, unchanged: no
 * configuration added, no parameter range altered, no family
 * redefined, no universe expanded. E-B/E-D are recorded
 * DATA_INSUFFICIENT (no historical SPY options-chain source in this
 * environment) — decided in `volatility-risk-premium.ts` BEFORE this
 * script was written, per the same precedent Block 8.2 §8 already set
 * for FX Family 2.
 *
 * Fail-fast 12-stage funnel (per this block's own instruction): data
 * integrity -> sanity/no-lookahead -> gross edge -> realistic costs ->
 * sample adequacy -> OOS -> walk-forward -> regimes -> Monte
 * Carlo/tail risk -> parameter robustness -> cumulative multiple-
 * testing adjustment -> RS3M correlation -> portfolio contribution.
 * A failure at any stage stops that config's deeper stages
 * immediately (matching Block 8.3's own fail-fast convention) and is
 * recorded as REJECTED with the exact stage/reason.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/strategy2/run-block9b-funnel.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../../lib/sandbox-io";
setupSandboxIO();

import type { Candle } from "@/core/market-data/types";
import { computeSkewness, computeKurtosis, deflatedSharpeRatio, probabilisticSharpeRatio } from "@/core/backtesting/research/deflated-sharpe";
import { computeMonthlyReturnMetrics } from "@/core/backtesting/research/portfolio-metrics";
import { pearsonCorrelation } from "@/core/backtesting/research/strategy-similarity";
import { runMonthlyMonteCarloBlockBootstrap } from "@/core/backtesting/research/monthly-monte-carlo";
import { classifySampleQuality } from "@/core/backtesting/sample-quality";
import { splitMonthsChronologically, OOS_HOLDOUT_PCT } from "@/core/portfolio-research/oos-split";
import { buildMonthlyWalkForwardWindows, type MonthlyWalkForwardConfig } from "@/core/portfolio-research/walk-forward";
import { aggregateDailyToMonthly, toAdjustedCandles } from "@/core/us-index-research/daily-series";
import { buildMonthlyRegimeLabels, computeRegimeBucketBreakdown, countPositiveUsIndexRegimes } from "@/core/us-index-research/regime-breakdown";
import { buildRs3mBenchmarkSeries } from "@/core/us-index-research/rs3m-benchmark";
import type { UsIndexDailyBar, UsIndexMarket } from "@/core/us-index-research/types";
import type { CostScenario } from "@/core/us-index-research/cost-model";

import { runOvernightOnlyBacktest, runOvernightIntradayTugOfWarBacktest } from "@/core/strategy2-research/overnight-intraday";
import { runTurnOfMonthBacktest } from "@/core/strategy2-research/turn-of-month";
import { runDefensiveTiltBacktest, runStaticLongOnlyBacktest, type DefensiveTiltRanking } from "@/core/strategy2-research/defensive-lowvol";
import { runTimeSeriesReversalBacktest, runCrossSectionalReversalBacktest } from "@/core/strategy2-research/short-term-reversal";
import { runVolatilityRiskPremiumBacktest, type VixPoint } from "@/core/strategy2-research/volatility-risk-premium";
import type { Strategy2DayResult } from "@/core/strategy2-research/types";

const DATASET_DIR = join(process.cwd(), "results", "block9b", "datasets");
const OUTPUT_DIR = join(process.cwd(), "results", "block9b");

const PRIOR_CUMULATIVE_TRIALS = 154; // docs/BLOCK9_STRATEGY2_DISCOVERY_REPORT.md §2 — reconciled 5+42+24+29+24+30

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

/** Local equivalent of `toAdjustedCandles` for tickers outside the 4-ETF `UsIndexMarket` union (SVXY, USMV, SPLV). */
function toAdjustedCandlesGeneric(bars: readonly RawBar[], symbol: string): Candle[] {
  return [...bars]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bar) => {
      const ratio = bar.close > 0 ? bar.adjClose / bar.close : 1;
      return {
        market: "SP500" as const, // placeholder — these tickers have no dedicated `Market` enum value; never read downstream for these configs
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

// ---------------------------------------------------------------------------
// Stage machinery
// ---------------------------------------------------------------------------

type StageStatus = "PASS" | "FAIL" | "SKIPPED";

interface StageResult {
  stage: string;
  status: StageStatus;
  detail: string;
}

interface ConfigOutcome {
  id: string;
  family: string;
  description: string;
  stages: StageResult[];
  finalStatus: "CANDIDATE" | "RESEARCH" | "REJECTED" | "DATA_INSUFFICIENT";
  rejectionReason: string | undefined;
  metrics:
    | undefined
    | {
        monthsCount: number;
        grossTotalReturnPct: number;
        netTotalReturnPct: { OPTIMISTIC: number; REALISTIC: number; STRESSED: number };
        cagrPct: { REALISTIC: number | undefined };
        annualizedSharpe: { REALISTIC: number | undefined };
        maxDrawdownPct: { REALISTIC: number };
        oosNetTotalReturnPct: number | undefined;
        walkForward: { windowCount: number; positivePct: number | undefined };
        regimePositiveCount: number | undefined;
        monteCarlo: { p95MaxDrawdownPct: number; probabilityOfTerminalLossPct: number } | undefined;
        parameterRobustness: { baseSharpe: number | undefined; minus10Sharpe: number | undefined; plus10Sharpe: number | undefined; classification: "PLATEAU" | "CLIFF" | "NOT_EVALUATED" };
        dsr: { numTrialsOwnPool: number; sharpeStdDevOwnPool: number; dsrOwnPool: number | undefined; numTrialsCumulativePool: number; dsrCumulativePool: number | undefined };
        correlationVsRs3m: number | undefined;
        /** Family M's own pre-registered decay check (§11): most-recent-10-years-only net total return, vs the full-sample figure above. `undefined` for non-M families (not evaluated). */
        recentDecadeNetTotalReturnPct: number | undefined;
      };
}

function stageFail(stages: StageResult[], stage: string, detail: string): StageResult[] {
  return [...stages, { stage, status: "FAIL", detail }];
}
function stagePass(stages: StageResult[], stage: string, detail: string): StageResult[] {
  return [...stages, { stage, status: "PASS", detail }];
}

// ---------------------------------------------------------------------------
// Config registry (frozen — mirrors docs/BLOCK9_STRATEGY2_PREREGISTRATION.md §4 exactly)
// ---------------------------------------------------------------------------

interface ConfigSpec {
  id: string;
  family: "D" | "E" | "M" | "F" | "C";
  description: string;
  walkForward: MonthlyWalkForwardConfig;
  build: (scenario: CostScenario) => Strategy2DayResult[] | "DATA_INSUFFICIENT";
  buildPerturbed?: (delta: number, scenario: CostScenario) => Strategy2DayResult[] | undefined; // delta e.g. -0.10 / +0.10; undefined = not evaluated
  killCriterion?: (m: NonNullable<ConfigOutcome["metrics"]>) => string | undefined; // family-specific kill criterion (§11); returns a rejection reason string if triggered
}

/** Family M's pre-registered kill criterion (§11): full-sample net-positive but most-recent-decade net-negative is treated as decay-driven REJECTION, even if the full-sample figure alone would otherwise pass. */
function decayKillCriterion(m: NonNullable<ConfigOutcome["metrics"]>): string | undefined {
  if (m.recentDecadeNetTotalReturnPct !== undefined && m.netTotalReturnPct.REALISTIC > 0 && m.recentDecadeNetTotalReturnPct <= 0) {
    return `Decay kill criterion (pre-registration §11): full-sample net return is positive (${m.netTotalReturnPct.REALISTIC.toFixed(2)}%) but the most-recent-10-years-only net return is ${m.recentDecadeNetTotalReturnPct.toFixed(2)}% — not positive. Treated as REJECTED on decay grounds, not averaged away.`;
  }
  return undefined;
}

function main(): void {
  console.log("[Block 9.x] Loading datasets ...");
  const rawByTicker: Record<string, RawBar[]> = {};
  for (const t of ["SPY", "QQQ", "IWM", "DIA", "SVXY", "USMV", "SPLV"]) rawByTicker[t] = loadBars(t);
  const vix = loadVix();

  const usIndexBars: Record<UsIndexMarket, UsIndexDailyBar[]> = {
    SPY: rawByTicker.SPY,
    QQQ: rawByTicker.QQQ,
    IWM: rawByTicker.IWM,
    DIA: rawByTicker.DIA,
  };
  const candlesByTicker: Record<UsIndexMarket, Candle[]> = {
    SPY: toAdjustedCandles(usIndexBars.SPY, "SPY"),
    QQQ: toAdjustedCandles(usIndexBars.QQQ, "QQQ"),
    IWM: toAdjustedCandles(usIndexBars.IWM, "IWM"),
    DIA: toAdjustedCandles(usIndexBars.DIA, "DIA"),
  };
  const svxyCandles = toAdjustedCandlesGeneric(rawByTicker.SVXY, "SVXY");
  const usmvCandles = toAdjustedCandlesGeneric(rawByTicker.USMV, "USMV");
  const splvCandles = toAdjustedCandlesGeneric(rawByTicker.SPLV, "SPLV");

  console.log("[Block 9.x] Building RS3M benchmark series (read-only) ...");
  const rs3mBenchmark = buildRs3mBenchmarkSeries(usIndexBars);
  const rs3mByMonth = new Map(rs3mBenchmark.months.map((m, i) => [m, rs3mBenchmark.monthlyReturnsPct[i]]));

  console.log("[Block 9.x] Building SPY regime labels (read-only, Block 8.3's own regime module) ...");
  const regimeLabels = buildMonthlyRegimeLabels(usIndexBars.SPY, "SPY");

  // -------------------------------------------------------------------------
  // 20 pre-registered configurations
  // -------------------------------------------------------------------------
  const configs: ConfigSpec[] = [
    {
      id: "D-A",
      family: "D",
      description: "SPY overnight-only (close->open), flat intraday",
      walkForward: { trainMonths: 24, forwardMonths: 6, stepMonths: 6 },
      build: (scenario) => runOvernightOnlyBacktest(candlesByTicker.SPY, scenario),
    },
    {
      id: "D-B",
      family: "D",
      description: "QQQ overnight-only (close->open), flat intraday",
      walkForward: { trainMonths: 24, forwardMonths: 6, stepMonths: 6 },
      build: (scenario) => runOvernightOnlyBacktest(candlesByTicker.QQQ, scenario),
    },
    {
      id: "D-C",
      family: "D",
      description: "SPY tug-of-war: long overnight AND short intraday, simultaneous",
      walkForward: { trainMonths: 24, forwardMonths: 6, stepMonths: 6 },
      build: (scenario) => runOvernightIntradayTugOfWarBacktest(candlesByTicker.SPY, scenario),
    },
    {
      id: "D-D",
      family: "D",
      description: "IWM overnight-only (close->open), flat intraday",
      walkForward: { trainMonths: 24, forwardMonths: 6, stepMonths: 6 },
      build: (scenario) => runOvernightOnlyBacktest(candlesByTicker.IWM, scenario),
    },
    {
      id: "E-A",
      family: "E",
      description: "Long SVXY, fixed notional, hard -15% stop, unconditional entry",
      walkForward: { trainMonths: 36, forwardMonths: 6, stepMonths: 6 },
      build: (scenario) => runVolatilityRiskPremiumBacktest(svxyCandles, vix, { stopLossPct: 0.15 }, scenario),
      buildPerturbed: (delta) => runVolatilityRiskPremiumBacktest(svxyCandles, vix, { stopLossPct: 0.15 * (1 + delta) }, "REALISTIC"),
    },
    {
      id: "E-B",
      family: "E",
      description: "SPY monthly put credit spread, unconditional entry — DATA_INSUFFICIENT (no historical options chain)",
      walkForward: { trainMonths: 36, forwardMonths: 6, stepMonths: 6 },
      build: () => "DATA_INSUFFICIENT",
    },
    {
      id: "E-C",
      family: "E",
      description: "Long SVXY, fixed notional, hard -15% stop, entry gated on VIX percentile <= median",
      walkForward: { trainMonths: 36, forwardMonths: 6, stepMonths: 6 },
      build: (scenario) => runVolatilityRiskPremiumBacktest(svxyCandles, vix, { stopLossPct: 0.15, vixPercentileFilterBelow: 0.5 }, scenario),
      buildPerturbed: (delta) => runVolatilityRiskPremiumBacktest(svxyCandles, vix, { stopLossPct: 0.15 * (1 + delta), vixPercentileFilterBelow: 0.5 }, "REALISTIC"),
    },
    {
      id: "E-D",
      family: "E",
      description: "SPY monthly put credit spread, VIX-percentile-gated — DATA_INSUFFICIENT (no historical options chain)",
      walkForward: { trainMonths: 36, forwardMonths: 6, stepMonths: 6 },
      build: () => "DATA_INSUFFICIENT",
    },
    {
      id: "M-A",
      family: "M",
      description: "SPY turn-of-month (last day of month -> close of 3rd trading day next month)",
      walkForward: { trainMonths: 60, forwardMonths: 12, stepMonths: 12 },
      build: (scenario) => runTurnOfMonthBacktest(candlesByTicker.SPY, scenario),
      killCriterion: decayKillCriterion,
    },
    {
      id: "M-B",
      family: "M",
      description: "QQQ turn-of-month",
      walkForward: { trainMonths: 60, forwardMonths: 12, stepMonths: 12 },
      build: (scenario) => runTurnOfMonthBacktest(candlesByTicker.QQQ, scenario),
      killCriterion: decayKillCriterion,
    },
    {
      id: "M-C",
      family: "M",
      description: "IWM turn-of-month",
      walkForward: { trainMonths: 60, forwardMonths: 12, stepMonths: 12 },
      build: (scenario) => runTurnOfMonthBacktest(candlesByTicker.IWM, scenario),
      killCriterion: decayKillCriterion,
    },
    {
      id: "M-D",
      family: "M",
      description: "DIA turn-of-month",
      walkForward: { trainMonths: 60, forwardMonths: 12, stepMonths: 12 },
      build: (scenario) => runTurnOfMonthBacktest(candlesByTicker.DIA, scenario),
      killCriterion: decayKillCriterion,
    },
    {
      id: "F-A",
      family: "F",
      description: "In-house monthly tilt: long lowest-2-of-4 by trailing 20d realized vol",
      walkForward: { trainMonths: 60, forwardMonths: 12, stepMonths: 12 },
      build: (scenario) => runDefensiveTiltBacktest(candlesByTicker, "REALIZED_VOL" as DefensiveTiltRanking, scenario),
    },
    {
      id: "F-B",
      family: "F",
      description: "In-house monthly tilt: long lowest-2-of-4 by trailing 60d beta vs equal-weight basket",
      walkForward: { trainMonths: 60, forwardMonths: 12, stepMonths: 12 },
      build: (scenario) => runDefensiveTiltBacktest(candlesByTicker, "BETA" as DefensiveTiltRanking, scenario),
    },
    {
      id: "F-C",
      family: "F",
      description: "Long-only, unconditional, USMV",
      walkForward: { trainMonths: 60, forwardMonths: 12, stepMonths: 12 },
      build: () => runStaticLongOnlyBacktest(usmvCandles),
    },
    {
      id: "F-D",
      family: "F",
      description: "Long-only, unconditional, SPLV",
      walkForward: { trainMonths: 60, forwardMonths: 12, stepMonths: 12 },
      build: () => runStaticLongOnlyBacktest(splvCandles),
    },
    {
      id: "C-A",
      family: "C",
      description: "SPY time-series reversal: long 1 day after a bottom-decile trailing-252d daily return",
      walkForward: { trainMonths: 24, forwardMonths: 6, stepMonths: 6 },
      build: (scenario) => runTimeSeriesReversalBacktest(candlesByTicker.SPY, scenario),
      buildPerturbed: (delta) => runTimeSeriesReversalBacktest(candlesByTicker.SPY, "REALISTIC", 0.1 * (1 + delta)),
    },
    {
      id: "C-B",
      family: "C",
      description: "QQQ time-series reversal",
      walkForward: { trainMonths: 24, forwardMonths: 6, stepMonths: 6 },
      build: (scenario) => runTimeSeriesReversalBacktest(candlesByTicker.QQQ, scenario),
      buildPerturbed: (delta) => runTimeSeriesReversalBacktest(candlesByTicker.QQQ, "REALISTIC", 0.1 * (1 + delta)),
    },
    {
      id: "C-C",
      family: "C",
      description: "Cross-sectional daily reversal: long yesterday's worst performer among SPY/QQQ/IWM/DIA",
      walkForward: { trainMonths: 24, forwardMonths: 6, stepMonths: 6 },
      build: (scenario) => runCrossSectionalReversalBacktest(candlesByTicker, "daily", scenario),
    },
    {
      id: "C-D",
      family: "C",
      description: "Cross-sectional weekly reversal: long last week's worst performer among SPY/QQQ/IWM/DIA",
      walkForward: { trainMonths: 24, forwardMonths: 6, stepMonths: 6 },
      build: (scenario) => runCrossSectionalReversalBacktest(candlesByTicker, "weekly", scenario),
    },
  ];

  // -------------------------------------------------------------------------
  // Pass 1: run every config through Stages 1-9 (everything except the
  // cross-config multiple-testing stage, which needs every config's own
  // Sharpe first).
  // -------------------------------------------------------------------------
  interface Interim {
    spec: ConfigSpec;
    stages: StageResult[];
    dataInsufficient: boolean;
    monthly: { months: string[]; returnsPct: number[] } | undefined;
    metrics: ConfigOutcome["metrics"];
    stoppedReason: string | undefined;
  }
  const interim: Interim[] = [];

  for (const spec of configs) {
    let stages: StageResult[] = [];
    console.log(`[Block 9.x] Running ${spec.id} — ${spec.description}`);

    // Stage 1: data integrity
    const built = spec.build("REALISTIC");
    if (built === "DATA_INSUFFICIENT") {
      stages = stageFail(stages, "data_integrity", "No historical SPY options-chain data source available in this environment — decided before any code for this config path was written (Block 8.2 Family-2 precedent).");
      interim.push({ spec, stages, dataInsufficient: true, monthly: undefined, metrics: undefined, stoppedReason: "DATA_INSUFFICIENT at Stage 1 (data integrity)" });
      continue;
    }
    const dailyResults = built;
    if (dailyResults.length === 0) {
      stages = stageFail(stages, "data_integrity", "Zero day-results produced — refusing to proceed.");
      interim.push({ spec, stages, dataInsufficient: false, monthly: undefined, metrics: undefined, stoppedReason: "No usable data" });
      continue;
    }
    const dates = dailyResults.map((r) => r.date);
    const sortedUnique = new Set(dates);
    if (sortedUnique.size !== dates.length) {
      stages = stageFail(stages, "data_integrity", "Duplicate dates found in day-result series.");
      interim.push({ spec, stages, dataInsufficient: false, monthly: undefined, metrics: undefined, stoppedReason: "Duplicate dates" });
      continue;
    }
    const isMonotonic = dates.every((d, i) => i === 0 || d > dates[i - 1]);
    if (!isMonotonic) {
      stages = stageFail(stages, "data_integrity", "Dates not strictly increasing.");
      interim.push({ spec, stages, dataInsufficient: false, monthly: undefined, metrics: undefined, stoppedReason: "Non-monotonic dates" });
      continue;
    }
    stages = stagePass(stages, "data_integrity", `${dailyResults.length} day-results, no duplicates, monotonic dates.`);

    // Stage 2: sanity / no-lookahead
    const hasNaN = dailyResults.some((r) => !Number.isFinite(r.netReturn) || !Number.isFinite(r.grossReturn));
    if (hasNaN) {
      stages = stageFail(stages, "sanity_no_lookahead", "Non-finite return values found.");
      interim.push({ spec, stages, dataInsufficient: false, monthly: undefined, metrics: undefined, stoppedReason: "Non-finite returns" });
      continue;
    }
    stages = stagePass(stages, "sanity_no_lookahead", "No non-finite returns. Causal-by-construction (every signal decides day i's position from data known by close of day i-1 or earlier) — verified structurally in code and by dedicated no-lookahead regression tests (tests/core/strategy2-research/no-lookahead.test.ts).");

    // Stage 3: gross edge
    const grossTotal = dailyResults.reduce((eq, r) => eq * (1 + r.grossReturn), 1) - 1;
    if (!(grossTotal > 0)) {
      stages = stageFail(stages, "gross_edge", `Gross (zero-cost) total return ${(grossTotal * 100).toFixed(2)}% is not positive.`);
      interim.push({ spec, stages, dataInsufficient: false, monthly: undefined, metrics: undefined, stoppedReason: `No positive gross edge (${(grossTotal * 100).toFixed(2)}%)` });
      continue;
    }
    stages = stagePass(stages, "gross_edge", `Gross total return ${(grossTotal * 100).toFixed(2)}%.`);

    // Stage 4: realistic costs
    const netTotalRealistic = dailyResults.reduce((eq, r) => eq * (1 + r.netReturn), 1) - 1;
    const optimisticBuilt = spec.build("OPTIMISTIC");
    const stressedBuilt = spec.build("STRESSED");
    const netTotalOptimistic = optimisticBuilt === "DATA_INSUFFICIENT" ? 0 : optimisticBuilt.reduce((eq, r) => eq * (1 + r.netReturn), 1) - 1;
    const netTotalStressed = stressedBuilt === "DATA_INSUFFICIENT" ? 0 : stressedBuilt.reduce((eq, r) => eq * (1 + r.netReturn), 1) - 1;
    if (!(netTotalRealistic > 0)) {
      stages = stageFail(stages, "realistic_costs", `Net total return at REALISTIC cost is ${(netTotalRealistic * 100).toFixed(2)}% — not positive. This is a per-family pre-registered automatic kill criterion for families D and C.`);
      interim.push({ spec, stages, dataInsufficient: false, monthly: undefined, metrics: undefined, stoppedReason: `Net-negative at REALISTIC cost (${(netTotalRealistic * 100).toFixed(2)}%)` });
      continue;
    }
    stages = stagePass(stages, "realistic_costs", `Net total return ${(netTotalRealistic * 100).toFixed(2)}% at REALISTIC cost (OPTIMISTIC ${(netTotalOptimistic * 100).toFixed(2)}%, STRESSED ${(netTotalStressed * 100).toFixed(2)}%).`);

    // Monthly aggregation (shared by every remaining stage, including Stage 5 below)
    const monthly = aggregateDailyToMonthly(dates, dailyResults.map((r) => r.netReturn));

    // Stage 5: sample adequacy. Measured in MONTHS (not raw turnover-event
    // count) so families with very different trading frequencies are
    // compared on a common footing — a static buy-and-hold (F-C/F-D) has
    // zero turnover EVENTS by design but is fully exposed every single day,
    // which a turnover-event count would wrongly read as "0 trades."
    // `activeCount` (informational only, reported alongside) is still the
    // right diagnostic for event-triggered families like M/C-A/C-B.
    const activeCount = dailyResults.filter((r) => r.turnover > 0).length;
    const sampleQuality = classifySampleQuality(monthly.months.length);
    if (sampleQuality === "INSUFFICIENT") {
      stages = stageFail(stages, "sample_adequacy", `Only ${monthly.months.length} months of usable data (${activeCount} turnover events) — INSUFFICIENT sample.`);
      interim.push({ spec, stages, dataInsufficient: false, monthly: undefined, metrics: undefined, stoppedReason: `Sample INSUFFICIENT (${monthly.months.length} months)` });
      continue;
    }
    stages = stagePass(stages, "sample_adequacy", `${monthly.months.length} months of usable data, ${activeCount} turnover events, sample quality ${sampleQuality}.`);

    // Stage 6: OOS
    const monthlyIndexed = monthly.months.map((m, i) => ({ month: m, returnPct: monthly.returnsPct[i] }));
    const { inSample, outOfSample } = splitMonthsChronologically(monthlyIndexed);
    if (outOfSample.length < 3) {
      stages = stageFail(stages, "oos", `Only ${outOfSample.length} OOS months (${OOS_HOLDOUT_PCT}% holdout) — too few to evaluate.`);
      interim.push({ spec, stages, dataInsufficient: false, monthly, metrics: undefined, stoppedReason: "Insufficient OOS months" });
      continue;
    }
    const oosTotal = outOfSample.reduce((eq, r) => eq * (1 + r.returnPct / 100), 1) - 1;
    if (!(oosTotal > 0)) {
      stages = stageFail(stages, "oos", `OOS total return ${(oosTotal * 100).toFixed(2)}% is not positive (${outOfSample.length} months, ${OOS_HOLDOUT_PCT}% holdout).`);
      interim.push({ spec, stages, dataInsufficient: false, monthly, metrics: undefined, stoppedReason: `OOS non-positive (${(oosTotal * 100).toFixed(2)}%)` });
      continue;
    }
    stages = stagePass(stages, "oos", `OOS total return ${(oosTotal * 100).toFixed(2)}% over ${outOfSample.length} months.`);

    // Stage 7: walk-forward (built from the IN-SAMPLE portion only, same convention as Block 8.3)
    const inSampleReturns = inSample.map((r) => r.returnPct);
    const wfWindows = buildMonthlyWalkForwardWindows(inSampleReturns, spec.walkForward);
    let wfPositivePct: number | undefined;
    if (wfWindows.length > 0) {
      const forwardTotals = wfWindows.map((w) => w.forward.reduce((eq, r) => eq * (1 + r / 100), 1) - 1);
      wfPositivePct = (forwardTotals.filter((v) => v > 0).length / forwardTotals.length) * 100;
    }
    stages = stagePass(stages, "walk_forward", wfWindows.length > 0 ? `${wfWindows.length} windows, ${wfPositivePct?.toFixed(1)}% positive.` : "No walk-forward windows fit the in-sample history — reported as 0 windows, not a failure by itself.");

    // Stage 8: regimes (reuses Block 8.3's own SPY regime module, read-only)
    const regimeBreakdown = computeRegimeBucketBreakdown(monthly.months, monthly.returnsPct, regimeLabels);
    const positiveRegimeCount = countPositiveUsIndexRegimes(regimeBreakdown);
    stages = stagePass(stages, "regimes", `${positiveRegimeCount}/4 regime buckets (BULL/BEAR/LOW_VOL/HIGH_VOL) show a positive annualized return with >=6 months of data.`);

    // Stage 9: Monte Carlo / tail risk
    const mc = runMonthlyMonteCarloBlockBootstrap(monthly.returnsPct, { benchmarkMonthlyReturnsPct: undefined });
    stages = stagePass(stages, "monte_carlo_tail_risk", `Block-bootstrap MC: P95 MaxDD ${mc.maxDrawdownPct.p95.toFixed(1)}%, terminal-loss probability ${mc.probabilityOfTerminalLossPct.toFixed(1)}%.`);

    const monthlyMetrics = computeMonthlyReturnMetrics(monthly.returnsPct);
    const monthlyMetricsOptimistic = optimisticBuilt === "DATA_INSUFFICIENT" ? undefined : computeMonthlyReturnMetrics(aggregateDailyToMonthly(dates, optimisticBuilt.map((r) => r.netReturn)).returnsPct);
    const monthlyMetricsStressed = stressedBuilt === "DATA_INSUFFICIENT" ? undefined : computeMonthlyReturnMetrics(aggregateDailyToMonthly(dates, stressedBuilt.map((r) => r.netReturn)).returnsPct);
    void monthlyMetricsOptimistic;
    void monthlyMetricsStressed;

    const metrics: NonNullable<ConfigOutcome["metrics"]> = {
      monthsCount: monthly.months.length,
      grossTotalReturnPct: grossTotal * 100,
      netTotalReturnPct: { OPTIMISTIC: netTotalOptimistic * 100, REALISTIC: netTotalRealistic * 100, STRESSED: netTotalStressed * 100 },
      cagrPct: { REALISTIC: monthlyMetrics.cagrPct },
      annualizedSharpe: { REALISTIC: monthlyMetrics.sharpeRatio },
      maxDrawdownPct: { REALISTIC: monthlyMetrics.maxDrawdownPct },
      oosNetTotalReturnPct: oosTotal * 100,
      walkForward: { windowCount: wfWindows.length, positivePct: wfPositivePct },
      regimePositiveCount: positiveRegimeCount,
      monteCarlo: { p95MaxDrawdownPct: mc.maxDrawdownPct.p95, probabilityOfTerminalLossPct: mc.probabilityOfTerminalLossPct },
      parameterRobustness: { baseSharpe: undefined, minus10Sharpe: undefined, plus10Sharpe: undefined, classification: "NOT_EVALUATED" },
      dsr: { numTrialsOwnPool: 0, sharpeStdDevOwnPool: 0, dsrOwnPool: undefined, numTrialsCumulativePool: 0, dsrCumulativePool: undefined },
      correlationVsRs3m: undefined,
      recentDecadeNetTotalReturnPct: undefined,
    };

    if (spec.family === "M") {
      const recentMonths = monthly.returnsPct.slice(-120); // most-recent 10 years (or all available if shorter)
      metrics.recentDecadeNetTotalReturnPct = (recentMonths.reduce((eq, r) => eq * (1 + r / 100), 1) - 1) * 100;
    }

    // Stage 10: parameter robustness (only for configs with a perturbable core parameter)
    if (spec.buildPerturbed) {
      const baseSharpe = monthlyMetrics.sharpeRatio;
      const sharpeAt = (delta: number): number | undefined => {
        const perturbedDaily = spec.buildPerturbed!(delta, "REALISTIC");
        if (!perturbedDaily || perturbedDaily.length === 0) return undefined;
        const perturbedMonthly = aggregateDailyToMonthly(
          perturbedDaily.map((r) => r.date),
          perturbedDaily.map((r) => r.netReturn),
        );
        return computeMonthlyReturnMetrics(perturbedMonthly.returnsPct).sharpeRatio;
      };
      const minus10 = sharpeAt(-0.1);
      const plus10 = sharpeAt(0.1);
      const classification: "PLATEAU" | "CLIFF" =
        baseSharpe !== undefined && baseSharpe > 0 && ((minus10 !== undefined && minus10 < 0.5 * baseSharpe) || (plus10 !== undefined && plus10 < 0.5 * baseSharpe))
          ? "CLIFF"
          : "PLATEAU";
      metrics.parameterRobustness = { baseSharpe, minus10Sharpe: minus10, plus10Sharpe: plus10, classification };
      stages = stagePass(
        stages,
        "parameter_robustness",
        `Base Sharpe ${baseSharpe?.toFixed(3) ?? "n/a"}, -10% ${minus10?.toFixed(3) ?? "n/a"}, +10% ${plus10?.toFixed(3) ?? "n/a"} -> ${classification} (CLIFF rule: either perturbation drops Sharpe below 50% of base).`,
      );
    } else {
      stages = stagePass(stages, "parameter_robustness", "No single tunable core parameter for this config (fixed calendar/ranking rule) — not evaluated, not treated as a failure.");
    }

    // RS3M correlation (computed now, reported alongside DSR after Pass 2)
    const overlapMonths = monthly.months.filter((m) => rs3mByMonth.has(m));
    const candidateOverlap = overlapMonths.map((m) => monthly.returnsPct[monthly.months.indexOf(m)]);
    const rs3mOverlap = overlapMonths.map((m) => rs3mByMonth.get(m) as number);
    metrics.correlationVsRs3m = pearsonCorrelation(candidateOverlap, rs3mOverlap);

    interim.push({ spec, stages, dataInsufficient: false, monthly, metrics, stoppedReason: undefined });
  }

  // -------------------------------------------------------------------------
  // Pass 2: cumulative multiple-testing adjustment (Stage 11). Needs every
  // config's own Sharpe first — computed here, not per-config, per this
  // project's own established convention (Block 8.3 §16: DSR computed once
  // all experiments have run).
  // -------------------------------------------------------------------------
  const survivedToStage9 = interim.filter((r) => r.metrics !== undefined);
  const ownPoolSharpes = survivedToStage9.map((r) => r.metrics!.annualizedSharpe.REALISTIC).filter((s): s is number => s !== undefined);
  const ownPoolMean = ownPoolSharpes.reduce((s, v) => s + v, 0) / (ownPoolSharpes.length || 1);
  const ownPoolStdev = ownPoolSharpes.length > 1 ? Math.sqrt(ownPoolSharpes.reduce((s, v) => s + (v - ownPoolMean) ** 2, 0) / (ownPoolSharpes.length - 1)) : 0;
  const numTrialsOwnPool = ownPoolSharpes.length; // configs that actually ran a backtest (excludes DATA_INSUFFICIENT)
  const numTrialsCumulativePool = PRIOR_CUMULATIVE_TRIALS + numTrialsOwnPool;

  for (const r of survivedToStage9) {
    const m = r.metrics!;
    const sharpe = m.annualizedSharpe.REALISTIC;
    if (sharpe === undefined) {
      r.stages = stageFail(r.stages, "cumulative_multiple_testing", "No Sharpe ratio available (insufficient monthly variance) — cannot compute DSR.");
      continue;
    }
    const skewness = computeSkewness(r.monthly!.returnsPct);
    const kurtosis = computeKurtosis(r.monthly!.returnsPct);
    const numObservations = r.monthly!.months.length;

    const dsrOwnPool = probabilisticSharpeRatio({ sharpe, skewness, kurtosis, numObservations, benchmarkSharpe: 0 });
    const dsrCumulativePool = deflatedSharpeRatio({ sharpe, skewness, kurtosis, numObservations, numTrials: numTrialsCumulativePool, sharpeStdDevAcrossTrials: ownPoolStdev });

    m.dsr = { numTrialsOwnPool, sharpeStdDevOwnPool: ownPoolStdev, dsrOwnPool, numTrialsCumulativePool, dsrCumulativePool };
    r.stages = stagePass(
      r.stages,
      "cumulative_multiple_testing",
      `DSR (own ${numTrialsOwnPool}-trial pool, benchmark=0) = ${dsrOwnPool?.toFixed(3) ?? "n/a"}. DSR under full cumulative pool (${PRIOR_CUMULATIVE_TRIALS} prior + ${numTrialsOwnPool} this block = ${numTrialsCumulativePool} trials, stdev proxy = this block's own ${numTrialsOwnPool}-trial pool per Block 8.4's precedent) = ${dsrCumulativePool?.toFixed(3) ?? "n/a"}.`,
    );

    // Stage 12a: RS3M correlation gate (reported as its own stage even though the value was computed in Pass 1)
    if (m.correlationVsRs3m === undefined) {
      r.stages = stagePass(r.stages, "rs3m_correlation", "Could not be computed (no overlapping months with RS3M's own benchmark series).");
    } else {
      r.stages = stagePass(r.stages, "rs3m_correlation", `Pearson correlation of monthly returns vs RS3M_CANDIDATE_V1's own benchmark series (overlapping months only): ${m.correlationVsRs3m.toFixed(3)}.`);
    }
  }

  // -------------------------------------------------------------------------
  // Final classification per pre-registration §10 (11-point candidate bar)
  // and §11 (family-specific kill criteria).
  // -------------------------------------------------------------------------
  const outcomes: ConfigOutcome[] = interim.map((r) => {
    if (r.dataInsufficient) {
      return { id: r.spec.id, family: r.spec.family, description: r.spec.description, stages: r.stages, finalStatus: "DATA_INSUFFICIENT", rejectionReason: r.stoppedReason, metrics: undefined };
    }
    if (r.metrics === undefined) {
      return { id: r.spec.id, family: r.spec.family, description: r.spec.description, stages: r.stages, finalStatus: "REJECTED", rejectionReason: r.stoppedReason, metrics: undefined };
    }
    const m = r.metrics;

    // Family-specific pre-registered kill criteria (§11), checked BEFORE the general 11-point bar.
    const kill = r.spec.killCriterion?.(m);
    if (kill) {
      return { id: r.spec.id, family: r.spec.family, description: r.spec.description, stages: r.stages, finalStatus: "REJECTED", rejectionReason: kill, metrics: m };
    }

    const walkForwardMajority = (m.walkForward.positivePct ?? 0) >= 50 && m.walkForward.windowCount > 0;
    const dsrOk = (m.dsr.dsrCumulativePool ?? 0) >= 0.5;
    const notCliff = m.parameterRobustness.classification !== "CLIFF";
    const diversifies = m.correlationVsRs3m === undefined || Math.abs(m.correlationVsRs3m) < 0.5;
    const acceptableTail = m.monteCarlo !== undefined && m.monteCarlo.p95MaxDrawdownPct < 90;

    const reasons: string[] = [];
    if (!walkForwardMajority) reasons.push(`walk-forward positive-window rate ${m.walkForward.positivePct?.toFixed(1) ?? "n/a"}% (need >=50% across >=1 window)`);
    if (!dsrOk) reasons.push(`DSR under the full cumulative pool (${m.dsr.dsrCumulativePool?.toFixed(3) ?? "n/a"}) is below the project's 0.5 candidate bar`);
    if (!notCliff) reasons.push("parameter sensitivity classified as CLIFF, not PLATEAU");
    if (!diversifies) reasons.push(`|correlation vs RS3M| = ${Math.abs(m.correlationVsRs3m ?? 0).toFixed(3)}, at or above the 0.50 diversification bar`);
    if (!acceptableTail) reasons.push(`Monte Carlo P95 max drawdown (${m.monteCarlo?.p95MaxDrawdownPct.toFixed(1)}%) is not acceptable`);

    if (reasons.length === 0) {
      return { id: r.spec.id, family: r.spec.family, description: r.spec.description, stages: r.stages, finalStatus: "CANDIDATE", rejectionReason: undefined, metrics: m };
    }
    // Cleared Stages 1-9 (positive gross/net/OOS edge, adequate sample) but falls short of the full CANDIDATE bar -> RESEARCH, not REJECTED, matching this project's own established 3-tier convention (Block 8.2/8.3).
    return { id: r.spec.id, family: r.spec.family, description: r.spec.description, stages: r.stages, finalStatus: "RESEARCH", rejectionReason: reasons.join("; "), metrics: m };
  });

  // -------------------------------------------------------------------------
  // Portfolio contribution for any CANDIDATE (only stage that runs for
  // survivors — per this block's explicit instruction, nothing here
  // connects to Paper/Alpaca/options/LIVE, and no independent verification
  // begins automatically).
  // -------------------------------------------------------------------------
  const candidates = outcomes.filter((o) => o.finalStatus === "CANDIDATE");
  const portfolioContributions: Record<string, { rs3mAloneSharpe: number | undefined; blendSharpe: number | undefined; rs3mAloneMaxDdPct: number; blendMaxDdPct: number; correlation: number | undefined }> = {};
  for (const c of candidates) {
    const interimRow = interim.find((r) => r.spec.id === c.id)!;
    const monthly = interimRow.monthly!;
    const overlapMonths = monthly.months.filter((m) => rs3mByMonth.has(m));
    const candidateSeries = overlapMonths.map((m) => monthly.returnsPct[monthly.months.indexOf(m)]);
    const rs3mSeries = overlapMonths.map((m) => rs3mByMonth.get(m) as number);
    const blendSeries = overlapMonths.map((_, i) => 0.5 * candidateSeries[i] + 0.5 * rs3mSeries[i]);

    const rs3mAloneMetrics = computeMonthlyReturnMetrics(rs3mSeries);
    const blendMetrics = computeMonthlyReturnMetrics(blendSeries);
    portfolioContributions[c.id] = {
      rs3mAloneSharpe: rs3mAloneMetrics.sharpeRatio,
      blendSharpe: blendMetrics.sharpeRatio,
      rs3mAloneMaxDdPct: rs3mAloneMetrics.maxDrawdownPct,
      blendMaxDdPct: blendMetrics.maxDrawdownPct,
      correlation: pearsonCorrelation(candidateSeries, rs3mSeries),
    };
  }

  // -------------------------------------------------------------------------
  // Write raw output
  // -------------------------------------------------------------------------
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    join(OUTPUT_DIR, "funnel-outcomes.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), priorCumulativeTrials: PRIOR_CUMULATIVE_TRIALS, numTrialsOwnPool, numTrialsCumulativePool, outcomes, portfolioContributions }, null, 2),
  );
  console.log(`[Block 9.x] Wrote ${join(OUTPUT_DIR, "funnel-outcomes.json")}`);

  console.log("\n[Block 9.x] Summary:");
  for (const o of outcomes) {
    console.log(`  ${o.id} (${o.family}): ${o.finalStatus}${o.rejectionReason ? " — " + o.rejectionReason : ""}`);
  }
}

if (!existsSync(DATASET_DIR)) {
  console.error(`[Block 9.x] Dataset dir ${DATASET_DIR} not found — run fetch-block9b-data.ts first.`);
  process.exitCode = 1;
} else {
  main();
}
