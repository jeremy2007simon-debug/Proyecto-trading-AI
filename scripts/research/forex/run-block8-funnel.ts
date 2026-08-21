/**
 * Block 8 (Forex Research Lab) — Stages 1-9 validation funnel over the
 * 29 pre-registered FX configurations (see `buildFunnelSpecs` below —
 * families A-E plus a small EXPLORATORY block on the 15m/30m short
 * window). Registered BEFORE any result was inspected, per the Block 8
 * brief's explicit anti-p-hacking instruction (§9): "registra las
 * hipótesis y configuraciones... antes de evaluar resultados finales."
 *
 * Mirrors `scripts/research/run-block5-funnel.ts`'s proven pipeline
 * structure (same stage order, same reused validation modules:
 * `classifyStrategy`, `computeBreakEvenCost`, `splitCandlesChronologically`,
 * `buildWalkForwardWindows`/`runWalkForwardWindows`,
 * `runMonteCarloSimulation`, `createExperimentRecord`) — adapted for FX:
 *   - Candles come from the local Yahoo-derived cache
 *     (`loadFxCandles`), not a live provider.
 *   - Realistic cost uses the FX pip-based OPTIMISTIC/REALISTIC/STRESSED
 *     presets (`forex-cost-presets.ts`), run all three per spec (§10),
 *     not a single equity-tuned preset. Swap/rollover is applied
 *     post-hoc on top of each (§10, §13).
 *   - The break-even-cost bps sweep uses a price-scale-safe generic
 *     cost function (`costsForBpsGeneric` below) instead of Block 5's
 *     `costsForBps`, whose `halfSpread` is a raw dollar figure
 *     calibrated for SPY's ~$450 price and would be wildly wrong at
 *     EUR/USD's ~1.1 or USD/JPY's ~150 price scale.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/forex/run-block8-funnel.ts
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

import { createProgressLogger } from "../../lib/progress-logger";
import { loadFxCandles } from "@/core/market-data/providers/fx-historical-cache";
import type { Candle } from "@/core/market-data/types";
import {
  DEFAULT_DATASET_SPLIT,
  DEFAULT_SAME_CANDLE_POLICY,
  ZERO_COST_BASELINE,
  type BacktestConfig,
  type BacktestRun,
  type ExecutionCostConfig,
  type WalkForwardConfig,
} from "@/core/backtesting/types";
import { createEventDrivenBacktestEngine } from "@/core/backtesting/event-driven-simulator";
import { splitCandlesChronologically } from "@/core/backtesting/dataset-split";
import { buildWalkForwardWindows, runWalkForwardWindows } from "@/core/backtesting/walk-forward";
import { runMonteCarloSimulation } from "@/core/backtesting/monte-carlo";
import { getForexResearchStrategyManager } from "@/core/strategy-manager/forex-research-registry";
import type { Timeframe } from "@/core/shared/types";
import type { StrategyParameters } from "@/core/strategy-manager/types";
import { classifyCostRobustness, computeBreakEvenCost, type CostSensitivityPoint } from "@/core/backtesting/research/break-even-cost";
import { classifyStrategy, type FunnelSummary } from "@/core/backtesting/research/classification";
import { createExperimentRecord } from "@/core/backtesting/research/experiment-registry";
import { applySwapAdjustment, getFxExecutionCostConfig, type FxCostScenario } from "@/core/backtesting/research/forex-cost-presets";

const OUTPUT_ROOT = join(process.cwd(), "results", "block8", "forex");
const STAGE_RESULTS_DIR = join(OUTPUT_ROOT, "stage-results");
const INITIAL_CAPITAL = 10_000;
const RISK_PER_TRADE_PCT = 0.5; // primary funnel pass — 0.10/0.25/0.50 swept separately for survivors (Task 7)
const MIN_SANITY_TRADES = 5;

type FxMarket = "FOREX_EURUSD" | "FOREX_GBPUSD" | "FOREX_USDJPY" | "FOREX_AUDUSD";

/** Price-scale-safe generic bps cost, used ONLY for the break-even-cost diagnostic sweep (never for the classification gate — see module docstring). */
function costsForBpsGeneric(bps: number): ExecutionCostConfig {
  return { commissionPerFill: 0, slippagePct: bps / 10_000, halfSpread: 0 };
}
const COST_SENSITIVITY_BPS = [0, 1, 2, 3, 5, 8];

/** Approximate FX-week bar counts (~120 tradable hours/week under this research's 24/5 calendar — see `forex-calendar.ts`), used only to size walk-forward windows in real-world time; never tuned to make windows pass. */
const HOURS_PER_TRADEABLE_WEEK = 120;
const BARS_PER_MONTH: Record<Timeframe, number> = {
  "1m": Math.round((HOURS_PER_TRADEABLE_WEEK * 60 * 4.33)),
  "5m": Math.round((HOURS_PER_TRADEABLE_WEEK * 12 * 4.33)),
  "15m": Math.round(HOURS_PER_TRADEABLE_WEEK * 4 * 4.33),
  "30m": Math.round(HOURS_PER_TRADEABLE_WEEK * 2 * 4.33),
  "1h": Math.round(HOURS_PER_TRADEABLE_WEEK * 4.33),
  "4h": Math.round((HOURS_PER_TRADEABLE_WEEK / 4) * 4.33),
  "1d": Math.round((HOURS_PER_TRADEABLE_WEEK / 24) * 4.33),
};

function walkForwardConfigFor(timeframe: Timeframe): WalkForwardConfig {
  const bpm = BARS_PER_MONTH[timeframe];
  return { trainBars: bpm * 8, validationBars: bpm * 2, forwardBars: bpm * 2, stepBars: bpm * 2 };
}

interface FunnelSpec {
  id: string;
  family: string;
  label: string;
  strategyId: string;
  market: FxMarket;
  timeframe: Timeframe;
  parameters: StrategyParameters;
  /** Marked true for the deliberately short-window (15m/30m) exploratory checks — see module docstring and `docs/BLOCK8_FOREX_RESEARCH_REPORT.md` §Data Quality. */
  exploratoryInsufficientSample?: boolean;
}

/**
 * The full, FIXED 29-configuration research budget (Block 8 brief §9:
 * "20-40 configuraciones TOTAL, no 40 por par"). Registered here, once,
 * before any funnel result was inspected — see git history for this
 * file's first commit as the audit trail.
 */
function buildFunnelSpecs(): FunnelSpec[] {
  const specs: FunnelSpec[] = [];

  // Family A — FX Trend/Momentum (5): ROC lookback sweep on EURUSD/1h,
  // one cross-pair check (GBPUSD/1h), one cross-timeframe check (EURUSD/4h).
  for (const n of [14, 20, 30]) {
    specs.push({
      id: `fx-trend-momentum-eurusd-1h-roc${n}`,
      family: "A: FX Trend/Momentum",
      label: `FX Trend/Momentum EURUSD 1h (ROC=${n})`,
      strategyId: "fx-trend-momentum",
      market: "FOREX_EURUSD",
      timeframe: "1h",
      parameters: { rocLookbackBars: n },
    });
  }
  specs.push({
    id: "fx-trend-momentum-gbpusd-1h-roc20",
    family: "A: FX Trend/Momentum",
    label: "FX Trend/Momentum GBPUSD 1h (ROC=20, cross-pair)",
    strategyId: "fx-trend-momentum",
    market: "FOREX_GBPUSD",
    timeframe: "1h",
    parameters: { rocLookbackBars: 20 },
  });
  specs.push({
    id: "fx-trend-momentum-eurusd-4h-roc20",
    family: "A: FX Trend/Momentum",
    label: "FX Trend/Momentum EURUSD 4h (ROC=20, cross-timeframe)",
    strategyId: "fx-trend-momentum",
    market: "FOREX_EURUSD",
    timeframe: "4h",
    parameters: { rocLookbackBars: 20 },
  });

  // Family B — FX Pullback in Trend (5): pullback-depth sweep on
  // EURUSD/1h, one cross-pair check (USDJPY/1h), one cross-timeframe
  // check (EURUSD/4h).
  for (const depth of [0.5, 1.0, 1.5]) {
    specs.push({
      id: `fx-pullback-trend-eurusd-1h-depth${depth}`,
      family: "B: FX Pullback in Trend",
      label: `FX Pullback Trend EURUSD 1h (depth=${depth}ATR)`,
      strategyId: "fx-pullback-trend",
      market: "FOREX_EURUSD",
      timeframe: "1h",
      parameters: { pullbackDepthAtrMultiple: depth },
    });
  }
  specs.push({
    id: "fx-pullback-trend-usdjpy-1h-depth1.0",
    family: "B: FX Pullback in Trend",
    label: "FX Pullback Trend USDJPY 1h (depth=1.0ATR, cross-pair)",
    strategyId: "fx-pullback-trend",
    market: "FOREX_USDJPY",
    timeframe: "1h",
    parameters: { pullbackDepthAtrMultiple: 1.0 },
  });
  specs.push({
    id: "fx-pullback-trend-eurusd-4h-depth1.0",
    family: "B: FX Pullback in Trend",
    label: "FX Pullback Trend EURUSD 4h (depth=1.0ATR, cross-timeframe)",
    strategyId: "fx-pullback-trend",
    market: "FOREX_EURUSD",
    timeframe: "4h",
    parameters: { pullbackDepthAtrMultiple: 1.0 },
  });

  // Family C — FX Volatility Breakout (5): compression-threshold sweep
  // on EURUSD/4h, one cross-pair check (AUDUSD/4h), one cross-timeframe
  // check (EURUSD/1h).
  for (const pct of [20, 30, 40]) {
    specs.push({
      id: `fx-volatility-breakout-eurusd-4h-p${pct}`,
      family: "C: FX Volatility Breakout",
      label: `FX Volatility Breakout EURUSD 4h (compression<=${pct}pct)`,
      strategyId: "fx-volatility-breakout",
      market: "FOREX_EURUSD",
      timeframe: "4h",
      parameters: { compressionPercentileThreshold: pct },
    });
  }
  specs.push({
    id: "fx-volatility-breakout-audusd-4h-p30",
    family: "C: FX Volatility Breakout",
    label: "FX Volatility Breakout AUDUSD 4h (compression<=30pct, cross-pair)",
    strategyId: "fx-volatility-breakout",
    market: "FOREX_AUDUSD",
    timeframe: "4h",
    parameters: { compressionPercentileThreshold: 30 },
  });
  specs.push({
    id: "fx-volatility-breakout-eurusd-1h-p30",
    family: "C: FX Volatility Breakout",
    label: "FX Volatility Breakout EURUSD 1h (compression<=30pct, cross-timeframe)",
    strategyId: "fx-volatility-breakout",
    market: "FOREX_EURUSD",
    timeframe: "1h",
    parameters: { compressionPercentileThreshold: 30 },
  });

  // Family D — FX Session Breakout (5): London-open vs New-York-open on
  // EURUSD/1h, one cross-pair check (GBPUSD/1h London), one more
  // cross-pair check (USDJPY/1h London).
  specs.push({
    id: "fx-session-breakout-eurusd-1h-london",
    family: "D: FX Session Breakout",
    label: "FX Session Breakout EURUSD 1h (London open)",
    strategyId: "fx-session-breakout",
    market: "FOREX_EURUSD",
    timeframe: "1h",
    parameters: { targetSession: "LONDON" },
  });
  specs.push({
    id: "fx-session-breakout-eurusd-1h-newyork",
    family: "D: FX Session Breakout",
    label: "FX Session Breakout EURUSD 1h (New York open)",
    strategyId: "fx-session-breakout",
    market: "FOREX_EURUSD",
    timeframe: "1h",
    parameters: { targetSession: "NEW_YORK" },
  });
  specs.push({
    id: "fx-session-breakout-eurusd-1h-overlap",
    family: "D: FX Session Breakout",
    label: "FX Session Breakout EURUSD 1h (London/NY overlap)",
    strategyId: "fx-session-breakout",
    market: "FOREX_EURUSD",
    timeframe: "1h",
    parameters: { targetSession: "LONDON_NEW_YORK_OVERLAP" },
  });
  specs.push({
    id: "fx-session-breakout-gbpusd-1h-london",
    family: "D: FX Session Breakout",
    label: "FX Session Breakout GBPUSD 1h (London open, cross-pair)",
    strategyId: "fx-session-breakout",
    market: "FOREX_GBPUSD",
    timeframe: "1h",
    parameters: { targetSession: "LONDON" },
  });
  specs.push({
    id: "fx-session-breakout-usdjpy-1h-london",
    family: "D: FX Session Breakout",
    label: "FX Session Breakout USDJPY 1h (London open, cross-pair)",
    strategyId: "fx-session-breakout",
    market: "FOREX_USDJPY",
    timeframe: "1h",
    parameters: { targetSession: "LONDON" },
  });

  // Family E — FX Controlled Mean Reversion (5): z-score sweep on
  // EURUSD/1h, one cross-pair check (AUDUSD/1h), one cross-timeframe
  // check (EURUSD/4h).
  for (const z of [1.5, 2.0, 2.5]) {
    specs.push({
      id: `fx-mean-reversion-eurusd-1h-z${z}`,
      family: "E: FX Controlled Mean Reversion",
      label: `FX Mean Reversion EURUSD 1h (z=${z})`,
      strategyId: "fx-mean-reversion",
      market: "FOREX_EURUSD",
      timeframe: "1h",
      parameters: { zScoreEntryThreshold: z },
    });
  }
  specs.push({
    id: "fx-mean-reversion-audusd-1h-z2.0",
    family: "E: FX Controlled Mean Reversion",
    label: "FX Mean Reversion AUDUSD 1h (z=2.0, cross-pair)",
    strategyId: "fx-mean-reversion",
    market: "FOREX_AUDUSD",
    timeframe: "1h",
    parameters: { zScoreEntryThreshold: 2.0 },
  });
  specs.push({
    id: "fx-mean-reversion-eurusd-4h-z2.0",
    family: "E: FX Controlled Mean Reversion",
    label: "FX Mean Reversion EURUSD 4h (z=2.0, cross-timeframe)",
    strategyId: "fx-mean-reversion",
    market: "FOREX_EURUSD",
    timeframe: "4h",
    parameters: { zScoreEntryThreshold: 2.0 },
  });

  // Exploratory-only block (4): 15m/30m short window (~81 days of
  // history — well below the ~365-day bar this research treats as
  // sufficient for OOS/walk-forward). Run anyway for completeness per
  // the brief's stated timeframe priority order, expected to be capped
  // at RESEARCH (never CANDIDATE) by the sample-quality gate regardless
  // of raw performance.
  specs.push({
    id: "fx-trend-momentum-eurusd-15m-roc20-exploratory",
    family: "EXPLORATORY (insufficient sample)",
    label: "FX Trend/Momentum EURUSD 15m (ROC=20) — EXPLORATORY",
    strategyId: "fx-trend-momentum",
    market: "FOREX_EURUSD",
    timeframe: "15m",
    parameters: { rocLookbackBars: 20 },
    exploratoryInsufficientSample: true,
  });
  specs.push({
    id: "fx-volatility-breakout-eurusd-30m-p30-exploratory",
    family: "EXPLORATORY (insufficient sample)",
    label: "FX Volatility Breakout EURUSD 30m (compression<=30pct) — EXPLORATORY",
    strategyId: "fx-volatility-breakout",
    market: "FOREX_EURUSD",
    timeframe: "30m",
    parameters: { compressionPercentileThreshold: 30 },
    exploratoryInsufficientSample: true,
  });
  specs.push({
    id: "fx-session-breakout-gbpusd-15m-london-exploratory",
    family: "EXPLORATORY (insufficient sample)",
    label: "FX Session Breakout GBPUSD 15m (London open) — EXPLORATORY",
    strategyId: "fx-session-breakout",
    market: "FOREX_GBPUSD",
    timeframe: "15m",
    parameters: { targetSession: "LONDON" },
    exploratoryInsufficientSample: true,
  });
  specs.push({
    id: "fx-mean-reversion-eurusd-15m-z2.0-exploratory",
    family: "EXPLORATORY (insufficient sample)",
    label: "FX Mean Reversion EURUSD 15m (z=2.0) — EXPLORATORY",
    strategyId: "fx-mean-reversion",
    market: "FOREX_EURUSD",
    timeframe: "15m",
    parameters: { zScoreEntryThreshold: 2.0 },
    exploratoryInsufficientSample: true,
  });

  return specs;
}

function gitCommit(): string | undefined {
  try {
    return execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim();
  } catch {
    return undefined;
  }
}

function baseConfig(spec: FunnelSpec, candles: readonly Candle[]): Omit<BacktestConfig, "costs"> {
  return {
    name: `block8-forex-${spec.id}`,
    market: spec.market,
    timeframe: spec.timeframe,
    mode: "SINGLE_STRATEGY",
    strategyIds: [spec.strategyId],
    dateFrom: candles[0].timestamp,
    dateTo: candles[candles.length - 1].timestamp,
    initialCapital: INITIAL_CAPITAL,
    riskPerTradePct: RISK_PER_TRADE_PCT,
    commission: 0,
    slippage: 0,
    sameCandlePolicy: DEFAULT_SAME_CANDLE_POLICY,
  };
}

function isUsableRun(run: BacktestRun): boolean {
  if (!run.metrics) return false;
  const m = run.metrics;
  return [m.expectancyR, m.averageR, m.maxDrawdownPct, m.returnPct].every((v) => Number.isFinite(v));
}

async function main() {
  mkdirSync(STAGE_RESULTS_DIR, { recursive: true });

  const manager = getForexResearchStrategyManager();
  const engine = createEventDrivenBacktestEngine(manager);
  const commit = gitCommit();

  const smokeLimit = process.env.BLOCK8_SMOKE_TEST_LIMIT ? Number(process.env.BLOCK8_SMOKE_TEST_LIMIT) : undefined;
  const specs = smokeLimit ? buildFunnelSpecs().slice(0, smokeLimit) : buildFunnelSpecs();
  const progress = createProgressLogger(specs.length);

  for (const spec of specs) {
    const outputPath = join(STAGE_RESULTS_DIR, `${spec.id}.json`);
    if (existsSync(outputPath)) {
      progress.log({ stage: "cached", strategy: spec.label, asset: spec.market, timeframe: spec.timeframe });
      continue;
    }

    progress.log({ stage: "Stage 1", strategy: spec.label, asset: spec.market, timeframe: spec.timeframe }, { increment: false });
    manager.setParameters(spec.strategyId, spec.parameters);

    let allCandles: Candle[];
    try {
      allCandles = loadFxCandles(spec.market, spec.timeframe);
    } catch (error) {
      writeFileSync(outputPath, JSON.stringify({ id: spec.id, spec, classification: "REJECTED_SANITY", reason: String(error) }, null, 2));
      progress.log({ stage: "REJECTED_SANITY (no cached data)", strategy: spec.label });
      continue;
    }
    if (allCandles.length === 0) {
      writeFileSync(outputPath, JSON.stringify({ id: spec.id, spec, classification: "REJECTED_SANITY", reason: "EMPTY_DATASET" }, null, 2));
      progress.log({ stage: "REJECTED_SANITY (empty)", strategy: spec.label });
      continue;
    }

    let stage1Run: BacktestRun;
    try {
      stage1Run = engine.run({ ...baseConfig(spec, allCandles), costs: ZERO_COST_BASELINE }, allCandles);
    } catch (error) {
      writeFileSync(outputPath, JSON.stringify({ id: spec.id, spec, classification: "REJECTED_SANITY", reason: String(error) }, null, 2));
      progress.log({ stage: "REJECTED_SANITY (error)", strategy: spec.label });
      continue;
    }

    const sanityPassed = stage1Run.trades.length >= MIN_SANITY_TRADES && isUsableRun(stage1Run);
    const zeroCostExpectancyR = stage1Run.metrics?.expectancyR;

    // --- Stage 3: FX cost scenarios (OPTIMISTIC/REALISTIC/STRESSED) + break-even bps sweep ---
    const costPoints: CostSensitivityPoint[] = [];
    const scenarioRuns: Partial<Record<FxCostScenario, BacktestRun>> = {};
    const scenarioSwapAdjusted: Partial<Record<FxCostScenario, { totalSwapCost: number; overnightTradeCount: number; swapAdjustedNetProfit: number; swapAdjustedReturnPct: number }>> = {};

    if (sanityPassed) {
      for (const bps of COST_SENSITIVITY_BPS) {
        const run = bps === 0 ? stage1Run : engine.run({ ...baseConfig(spec, allCandles), costs: costsForBpsGeneric(bps) }, allCandles);
        if (run.metrics) costPoints.push({ bps, expectancyR: run.metrics.expectancyR });
      }
      for (const scenario of ["OPTIMISTIC", "REALISTIC", "STRESSED"] as const) {
        const run = engine.run({ ...baseConfig(spec, allCandles), costs: getFxExecutionCostConfig(spec.market, scenario) }, allCandles);
        scenarioRuns[scenario] = run;
        const swap = applySwapAdjustment(run.trades, spec.market, scenario);
        const swapAdjustedNetProfit = (run.metrics?.netProfit ?? 0) + swap.totalSwapCost;
        scenarioSwapAdjusted[scenario] = {
          totalSwapCost: swap.totalSwapCost,
          overnightTradeCount: swap.overnightTradeCount,
          swapAdjustedNetProfit,
          swapAdjustedReturnPct: (swapAdjustedNetProfit / INITIAL_CAPITAL) * 100,
        };
      }
    }
    const breakEven = costPoints.length > 0 ? computeBreakEvenCost(costPoints) : undefined;
    const realisticRun = scenarioRuns.REALISTIC;
    const realisticCostExpectancyR = realisticRun?.metrics?.expectancyR;
    const survivesStage3 = sanityPassed && realisticCostExpectancyR !== undefined && realisticCostExpectancyR > 0;

    progress.log({ stage: survivesStage3 ? "Stage 4" : "Stage 3 (terminal)", strategy: spec.label }, { increment: false });

    let oosExpectancyR: number | undefined;
    let datasetInfo: unknown;
    let walkForwardSummary: { positivePct: number; windowCount: number; meanExpectancyR: number; medianExpectancyR: number } | undefined;
    let monteCarloResult: ReturnType<typeof runMonteCarloSimulation> | undefined;

    if (survivesStage3) {
      // --- Stage 4/5: OOS (chronological split, defined before results — DEFAULT_DATASET_SPLIT 60/20/20) ---
      const split = splitCandlesChronologically(allCandles, DEFAULT_DATASET_SPLIT);
      datasetInfo = {
        candleCount: allCandles.length,
        from: allCandles[0]?.timestamp,
        to: allCandles[allCandles.length - 1]?.timestamp,
        oosFrom: split.outOfSample[0]?.timestamp,
        oosTo: split.outOfSample[split.outOfSample.length - 1]?.timestamp,
        oosCandleCount: split.outOfSample.length,
      };
      if (split.outOfSample.length >= 2) {
        const oosRun = engine.run({ ...baseConfig(spec, split.outOfSample), costs: getFxExecutionCostConfig(spec.market, "REALISTIC") }, split.outOfSample);
        oosExpectancyR = oosRun.metrics?.expectancyR;
      }

      progress.log({ stage: "Stage 6", strategy: spec.label }, { increment: false });

      // --- Stage 6: walk-forward over the full cached dataset ---
      const wfConfig = walkForwardConfigFor(spec.timeframe);
      const windows = buildWalkForwardWindows(allCandles, wfConfig);
      if (windows.length > 0) {
        const results = runWalkForwardWindows(engine, { ...baseConfig(spec, allCandles), costs: getFxExecutionCostConfig(spec.market, "REALISTIC") }, windows);
        const forwardExpectancies = results.map((r) => r.forward.metrics?.expectancyR).filter((v): v is number => v !== undefined);
        const positiveCount = forwardExpectancies.filter((v) => v > 0).length;
        const sorted = [...forwardExpectancies].sort((a, b) => a - b);
        walkForwardSummary = {
          positivePct: forwardExpectancies.length > 0 ? (positiveCount / forwardExpectancies.length) * 100 : 0,
          windowCount: results.length,
          meanExpectancyR: forwardExpectancies.length > 0 ? forwardExpectancies.reduce((s, v) => s + v, 0) / forwardExpectancies.length : 0,
          medianExpectancyR: sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0,
        };
      }

      // --- Stage 8 (Monte Carlo — funnel pass at 1000 sims; survivors get a 10,000-sim re-run in Task 8) ---
      progress.log({ stage: "Stage 8", strategy: spec.label }, { increment: false });
      if (realisticRun && realisticRun.trades.length > 0) {
        monteCarloResult = runMonteCarloSimulation(realisticRun.trades, INITIAL_CAPITAL, RISK_PER_TRADE_PCT, 1000, 42);
      }
    }

    // --- Stage 7 (regime) reads straight from realisticRun.metrics.performanceByRegime — no extra compute. ---
    const performanceByRegime = realisticRun?.metrics?.performanceByRegime ?? {};
    const positiveRegimeCount = Object.values(performanceByRegime).filter(
      (m) => m !== undefined && m.totalTrades >= 10 && m.expectancyR > 0,
    ).length;

    // Cross-asset reproduction concept (Block 5's Stage 7) is approximated
    // here by "did at least one OTHER config in the same family reproduce
    // a positive realistic-cost edge" — computed in the separate
    // multiple-testing/candidate-decision pass (Task 8), not per-spec
    // here, since it needs every spec's result available first.
    const summary: FunnelSummary = {
      sanityPassed,
      zeroCostExpectancyR,
      realisticCostExpectancyR,
      breakEvenBps: breakEven?.breakEvenBps ?? null,
      oosExpectancyR,
      walkForwardPositiveWindowPct: walkForwardSummary?.positivePct,
      walkForwardWindowCount: walkForwardSummary?.windowCount ?? 0,
      sampleQuality: realisticRun?.metrics?.sampleQuality ?? stage1Run.metrics?.sampleQuality ?? "INSUFFICIENT",
      crossAssetPositiveCount: 0,
      crossAssetTestedCount: 0,
      monteCarloDrawdownP95Pct: monteCarloResult?.maxDrawdownPct.p95,
      positiveRegimeCount,
    };
    const { classification, reasons } = classifyStrategy(summary);
    const finalClassification = spec.exploratoryInsufficientSample && classification !== "REJECTED" ? "RESEARCH" : classification;
    const finalReasons = spec.exploratoryInsufficientSample
      ? [...reasons, "Capped at RESEARCH regardless of funnel outcome: this config's dataset (~81 days) is below this research's ~365-day sufficiency bar for OOS/walk-forward (see docs/BLOCK8_FOREX_RESEARCH_REPORT.md §Data Quality)."]
      : reasons;

    const record = createExperimentRecord(
      {
        strategyId: spec.strategyId,
        strategyVersion: manager.getRegistration(spec.strategyId)?.strategy.version ?? "unknown",
        parameters: spec.parameters,
        market: spec.market,
        timeframe: spec.timeframe,
        datasetFrom: allCandles[0].timestamp,
        datasetTo: allCandles[allCandles.length - 1].timestamp,
        costs: getFxExecutionCostConfig(spec.market, "REALISTIC"),
        executionMode: "MARKET",
      },
      { gitCommit: commit, classification: finalClassification },
    );

    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          id: spec.id,
          spec,
          record,
          summary,
          classification: finalClassification,
          reasons: finalReasons,
          costSensitivity: costPoints,
          breakEven,
          costRobustness: breakEven ? classifyCostRobustness(breakEven) : undefined,
          costScenarios: {
            OPTIMISTIC: { expectancyR: scenarioRuns.OPTIMISTIC?.metrics?.expectancyR, netProfit: scenarioRuns.OPTIMISTIC?.metrics?.netProfit, ...scenarioSwapAdjusted.OPTIMISTIC },
            REALISTIC: { expectancyR: scenarioRuns.REALISTIC?.metrics?.expectancyR, netProfit: scenarioRuns.REALISTIC?.metrics?.netProfit, ...scenarioSwapAdjusted.REALISTIC },
            STRESSED: { expectancyR: scenarioRuns.STRESSED?.metrics?.expectancyR, netProfit: scenarioRuns.STRESSED?.metrics?.netProfit, ...scenarioSwapAdjusted.STRESSED },
          },
          dataset: datasetInfo,
          walkForward: walkForwardSummary,
          performanceByRegime,
          monteCarlo: monteCarloResult,
          stage1TradeCount: stage1Run.trades.length,
          realisticTradeCount: realisticRun?.trades.length,
        },
        null,
        2,
      ),
    );

    progress.log({ stage: `Done (${finalClassification})`, strategy: spec.label });
  }

  console.log(`\n=== Block 8 FX funnel complete. Results in ${STAGE_RESULTS_DIR} ===`);
}

main().catch((error) => {
  console.error("[block8-forex-funnel] Unhandled error:", error);
  process.exitCode = 1;
});
