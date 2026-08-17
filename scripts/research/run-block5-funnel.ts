/**
 * Block 5 — Strategy Discovery & Validation Engine, Stages 1-9 funnel
 * over the 22 pre-registered single-asset/pairs base configurations (see
 * `docs/BLOCK5_STRATEGY_DISCOVERY_REPORT.md` for the full budget
 * justification — Family F/Relative Strength's 2 configs run separately
 * via `run-block5-relative-strength.ts`, since rotation doesn't fit this
 * trade-based funnel).
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/run-block5-funnel.ts
 *
 * Every stage reuses the existing engine/metrics/walk-forward/Monte
 * Carlo/regime-breakdown code UNCHANGED (see Fase 0 audit in the report).
 * Each spec's result is written to `results/block5/stage-results/<id>.json`
 * the moment it's computed; a spec whose file already exists is skipped
 * (safely re-runnable after interruption).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

import { setupSandboxIO } from "../lib/sandbox-io";
setupSandboxIO();

import { createProgressLogger } from "../lib/progress-logger";
import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import type { Candle, MarketDataProvider } from "@/core/market-data/types";
import {
  DEFAULT_DATASET_SPLIT,
  DEFAULT_SAME_CANDLE_POLICY,
  REALISTIC_COST_SCENARIO,
  ZERO_COST_BASELINE,
  type BacktestConfig,
  type BacktestRun,
  type WalkForwardConfig,
} from "@/core/backtesting/types";
import { createEventDrivenBacktestEngine } from "@/core/backtesting/event-driven-simulator";
import { splitCandlesChronologically } from "@/core/backtesting/dataset-split";
import { buildWalkForwardWindows, runWalkForwardWindows } from "@/core/backtesting/walk-forward";
import { runMonteCarloSimulation } from "@/core/backtesting/monte-carlo";
import { getResearchStrategyManager } from "@/core/strategy-manager/research-registry";
import type { Market, Timeframe } from "@/core/shared/types";
import type { StrategyParameters } from "@/core/strategy-manager/types";
import { classifyCostRobustness, computeBreakEvenCost, costsForBps, type CostSensitivityPoint } from "@/core/backtesting/research/break-even-cost";
import { classifyStrategy, type FunnelSummary } from "@/core/backtesting/research/classification";
import { createExperimentRecord } from "@/core/backtesting/research/experiment-registry";

const OUTPUT_ROOT = join(process.cwd(), "results", "block5");
const STAGE_RESULTS_DIR = join(OUTPUT_ROOT, "stage-results");
const INITIAL_CAPITAL = 10_000;
const RISK_PER_TRADE_PCT = 0.5;
const RECENT_YEARS = 2;
const LONG_HISTORY_FROM = "2016-01-01T00:00:00.000Z"; // same empirically-reliable-for-SPY-family start date used in Block 4.5
const CROSS_ASSETS: Market[] = ["NASDAQ100", "RUSSELL2000", "DOWJONES"];
const COST_SENSITIVITY_BPS = [0, 1, 2, 3, 5];
const MIN_SANITY_TRADES = 5;

function gitCommit(): string | undefined {
  try {
    return execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim();
  } catch {
    return undefined;
  }
}

/** Bar-count-per-calendar-month per timeframe, approximate (21 trading days, 6.5h RTH) — used only to size walk-forward windows in real-world time, never tuned to make windows pass. */
const BARS_PER_MONTH: Record<Timeframe, number> = { "1m": 8190, "5m": 1638, "15m": 546, "30m": 273, "1h": 137, "4h": 34, "1d": 21 };

function walkForwardConfigFor(timeframe: Timeframe): WalkForwardConfig {
  const bpm = BARS_PER_MONTH[timeframe];
  return { trainBars: bpm * 8, validationBars: bpm * 2, forwardBars: bpm * 2, stepBars: bpm * 2 };
}

interface FunnelSpec {
  id: string;
  family: string;
  label: string;
  strategyId: string;
  market: Market;
  timeframe: Timeframe;
  parameters: StrategyParameters;
  kind: "SINGLE_ASSET" | "PAIR";
  pairLegs?: [Market, Market];
}

function buildFunnelSpecs(): FunnelSpec[] {
  const specs: FunnelSpec[] = [];

  for (const n of [10, 20, 40]) {
    specs.push({
      id: `momentum-trend-roc${n}`,
      family: "Momentum Trend",
      label: `Momentum Trend (N=${n})`,
      strategyId: "momentum-trend",
      market: "SP500",
      timeframe: "1h",
      parameters: { rocLookbackBars: n },
      kind: "SINGLE_ASSET",
    });
  }
  for (const depth of [0.5, 1.0, 1.5]) {
    specs.push({
      id: `trend-pullback-depth${depth}`,
      family: "Trend Pullback",
      label: `Trend Pullback (depth=${depth}ATR)`,
      strategyId: "trend-pullback",
      market: "SP500",
      timeframe: "1h",
      parameters: { pullbackDepthAtrMultiple: depth },
      kind: "SINGLE_ASSET",
    });
  }
  for (const pct of [20, 30, 40]) {
    specs.push({
      id: `volatility-compression-breakout-p${pct}`,
      family: "Volatility Breakout",
      label: `Volatility Breakout (compression<=${pct}pct)`,
      strategyId: "volatility-compression-breakout",
      market: "SP500",
      timeframe: "15m",
      parameters: { compressionPercentileThreshold: pct },
      kind: "SINGLE_ASSET",
    });
  }
  for (const gap of [0.3, 0.5, 1.0]) {
    specs.push({
      id: `gap-continuation-gap${gap}`,
      family: "Gap Continuation",
      label: `Gap Continuation (gap>=${gap}pct)`,
      strategyId: "gap-continuation",
      market: "SP500",
      timeframe: "1d",
      parameters: { gapThresholdPct: gap },
      kind: "SINGLE_ASSET",
    });
  }
  for (const win of [30, 45, 60]) {
    specs.push({
      id: `session-momentum-win${win}`,
      family: "Session Momentum",
      label: `Session Momentum (window=${win}min)`,
      strategyId: "session-momentum",
      market: "SP500",
      timeframe: "5m",
      parameters: { closingWindowMinutes: win },
      kind: "SINGLE_ASSET",
    });
  }
  for (const adx of [20, 25, 30]) {
    specs.push({
      id: `volatility-regime-momentum-adx${adx}`,
      family: "Volatility Regime Momentum",
      label: `Volatility Regime Momentum (ADX>=${adx})`,
      strategyId: "volatility-regime-momentum",
      market: "SP500",
      timeframe: "30m",
      parameters: { adxMinimum: adx },
      kind: "SINGLE_ASSET",
    });
  }
  for (const [legLabel, leg] of [["QQQ", "NASDAQ100"], ["DIA", "DOWJONES"]] as const) {
    for (const z of [1.5, 2.0]) {
      specs.push({
        id: `pairs-spread-reversion-spy-${legLabel.toLowerCase()}-z${z}`,
        family: "Pairs Spread Reversion",
        label: `Pairs SPY/${legLabel} (z=${z})`,
        strategyId: "pairs-spread-reversion",
        market: "SP500",
        timeframe: "15m",
        parameters: { zScoreEntryThreshold: z },
        kind: "PAIR",
        pairLegs: ["SP500", leg],
      });
    }
  }

  return specs;
}

const candleCache = new Map<string, Candle[]>();

async function fetchCandlesCached(
  provider: MarketDataProvider,
  market: Market,
  timeframe: Timeframe,
  from: string,
): Promise<Candle[] | undefined> {
  const cacheKey = `${market}|${timeframe}|${from}`;
  const cached = candleCache.get(cacheKey);
  if (cached) return cached;

  const result = await provider.getHistoricalCandles({ market, timeframe, from });
  if (!result.ok) {
    console.error(`  [fetch failed] ${market}/${timeframe} from ${from}: ${result.error.code} — ${result.error.message}`);
    return undefined;
  }
  const candles = result.value.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  candleCache.set(cacheKey, candles);
  return candles;
}

/** Synthesizes a ratio "candle" series from two real legs (see `pairs-spread-reversion.strategy.ts`'s own docstring for the full construction rationale) — intersects by shared timestamp only, since the two legs' real fetches don't always share every bar. */
function buildRatioCandles(legA: readonly Candle[], legB: readonly Candle[], market: Market, timeframe: Timeframe, symbol: string): Candle[] {
  const legBByTimestamp = new Map(legB.map((c) => [c.timestamp, c]));
  const ratioCandles: Candle[] = [];
  for (const a of legA) {
    const b = legBByTimestamp.get(a.timestamp);
    if (!b || b.close <= 0) continue;
    const ratio = a.close / b.close;
    ratioCandles.push({
      market,
      timeframe,
      timestamp: a.timestamp,
      symbol,
      provider: "synthetic-ratio",
      open: ratio,
      high: ratio,
      low: ratio,
      close: ratio,
      volume: 0,
    });
  }
  return ratioCandles;
}

/**
 * `BacktestConfig.strategyParameterOverrides` is NOT read by the engine
 * (confirmed by inspection — only `backtest-runs.repository.ts` persists
 * it for audit). The engine reads whatever `StrategyManager.setParameters`
 * last set on that strategy's LIVE registration — so this script calls
 * `manager.setParameters(spec.strategyId, spec.parameters)` once before
 * running each spec's stages (see the main loop), and `baseConfig` here
 * carries no parameter field at all, to avoid implying a config field
 * that silently does nothing.
 */
function baseConfig(spec: FunnelSpec, candles: readonly Candle[]): Omit<BacktestConfig, "costs"> {
  return {
    name: `block5-${spec.id}`,
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
  const numericFields = [m.expectancyR, m.averageR, m.maxDrawdownPct, m.returnPct];
  return numericFields.every((v) => Number.isFinite(v));
}

async function main() {
  mkdirSync(STAGE_RESULTS_DIR, { recursive: true });

  const providerResult = createMarketDataProvider();
  if (!providerResult.ok) {
    console.error(`[block5-funnel] Market data provider unavailable: ${providerResult.error.message}`);
    process.exitCode = 1;
    return;
  }
  const provider = providerResult.value;
  const manager = getResearchStrategyManager();
  const engine = createEventDrivenBacktestEngine(manager);
  const commit = gitCommit();

  // Optional dev/debug knob — run only the first N specs (e.g. for a
  // quick smoke test after changing the pipeline). Unset in normal runs.
  const smokeLimit = process.env.BLOCK5_SMOKE_TEST_LIMIT ? Number(process.env.BLOCK5_SMOKE_TEST_LIMIT) : undefined;
  const specs = smokeLimit ? buildFunnelSpecs().slice(0, smokeLimit) : buildFunnelSpecs();
  const progress = createProgressLogger(specs.length);
  const recentFrom = new Date(Date.now() - RECENT_YEARS * 365.25 * 24 * 60 * 60 * 1000).toISOString();

  for (const spec of specs) {
    const outputPath = join(STAGE_RESULTS_DIR, `${spec.id}.json`);
    if (existsSync(outputPath)) {
      progress.log({ stage: "cached", strategy: spec.label, asset: spec.market, timeframe: spec.timeframe });
      continue;
    }

    progress.log({ stage: "Stage 1", strategy: spec.label, asset: spec.market, timeframe: spec.timeframe }, { increment: false });

    // Mutates the shared manager's LIVE registration for this strategyId —
    // safe because specs are processed strictly sequentially, never
    // concurrently, and every spec for a given strategyId always
    // overrides the same field(s), so there is no cross-spec leakage.
    manager.setParameters(spec.strategyId, spec.parameters);

    // --- fetch the recent (2yr) dataset (single-asset or synthetic pair) ---
    let recentCandles: Candle[] | undefined;
    if (spec.kind === "SINGLE_ASSET") {
      recentCandles = await fetchCandlesCached(provider, spec.market, spec.timeframe, recentFrom);
    } else {
      const [marketA, marketB] = spec.pairLegs!;
      const legA = await fetchCandlesCached(provider, marketA, spec.timeframe, recentFrom);
      const legB = await fetchCandlesCached(provider, marketB, spec.timeframe, recentFrom);
      recentCandles = legA && legB ? buildRatioCandles(legA, legB, spec.market, spec.timeframe, `${marketA}/${marketB}`) : undefined;
    }

    if (!recentCandles || recentCandles.length === 0) {
      writeFileSync(outputPath, JSON.stringify({ id: spec.id, spec, classification: "REJECTED_SANITY", reason: "FETCH_FAILED" }, null, 2));
      progress.log({ stage: "REJECTED_SANITY (fetch)", strategy: spec.label });
      continue;
    }

    let stage1Run: BacktestRun;
    try {
      stage1Run = engine.run({ ...baseConfig(spec, recentCandles), costs: ZERO_COST_BASELINE }, recentCandles);
    } catch (error) {
      writeFileSync(outputPath, JSON.stringify({ id: spec.id, spec, classification: "REJECTED_SANITY", reason: String(error) }, null, 2));
      progress.log({ stage: "REJECTED_SANITY (error)", strategy: spec.label });
      continue;
    }

    const sanityPassed = stage1Run.trades.length >= MIN_SANITY_TRADES && isUsableRun(stage1Run);
    const zeroCostExpectancyR = stage1Run.metrics?.expectancyR;

    // --- Stage 3: cost sensitivity (also gives us the realistic-cost run reused by regime/Monte Carlo below) ---
    const costPoints: CostSensitivityPoint[] = [];
    let realisticRun: BacktestRun | undefined;
    if (sanityPassed) {
      for (const bps of COST_SENSITIVITY_BPS) {
        const run = bps === 0 ? stage1Run : engine.run({ ...baseConfig(spec, recentCandles), costs: costsForBps(bps) }, recentCandles);
        if (run.metrics) costPoints.push({ bps, expectancyR: run.metrics.expectancyR });
        if (bps === 5) realisticRun = run;
      }
    }
    const breakEven = costPoints.length > 0 ? computeBreakEvenCost(costPoints) : undefined;
    const realisticCostExpectancyR = realisticRun?.metrics?.expectancyR;
    // The real gate is "positive expectancy at realistic cost" — the
    // BLOCK5_FORCE_DEEP_PATH escape hatch exists ONLY for dev/debug
    // smoke-testing Stages 4-9's wiring against real data without
    // waiting for an organically-surviving spec; unset (the default) in
    // every real research run, including every run behind this block's
    // actual results.
    const survivesStage3 =
      process.env.BLOCK5_FORCE_DEEP_PATH === "1" ||
      (sanityPassed && realisticCostExpectancyR !== undefined && realisticCostExpectancyR > 0);

    progress.log({ stage: survivesStage3 ? "Stage 4" : "Stage 3 (terminal)", strategy: spec.label }, { increment: false });

    let oosExpectancyR: number | undefined;
    let longHistoryInfo: unknown;
    let walkForwardSummary: { positivePct: number; windowCount: number; meanExpectancyR: number; medianExpectancyR: number } | undefined;
    let crossAssetPositiveCount = 0;
    let crossAssetTestedCount = 0;
    const crossAssetDetail: Record<string, number | undefined> = {};
    let monteCarloResult: ReturnType<typeof runMonteCarloSimulation> | undefined;

    if (survivesStage3) {
      // --- Stage 4/5: long history + OOS ---
      let longHistoryCandles: Candle[] | undefined;
      if (spec.kind === "SINGLE_ASSET") {
        longHistoryCandles = await fetchCandlesCached(provider, spec.market, spec.timeframe, LONG_HISTORY_FROM);
      } else {
        const [marketA, marketB] = spec.pairLegs!;
        const legA = await fetchCandlesCached(provider, marketA, spec.timeframe, LONG_HISTORY_FROM);
        const legB = await fetchCandlesCached(provider, marketB, spec.timeframe, LONG_HISTORY_FROM);
        longHistoryCandles = legA && legB ? buildRatioCandles(legA, legB, spec.market, spec.timeframe, `${marketA}/${marketB}`) : undefined;
      }
      const oosSourceCandles = longHistoryCandles && longHistoryCandles.length > recentCandles.length ? longHistoryCandles : recentCandles;
      const split = splitCandlesChronologically(oosSourceCandles, DEFAULT_DATASET_SPLIT);
      longHistoryInfo = {
        usedLongHistory: oosSourceCandles === longHistoryCandles,
        candleCount: oosSourceCandles.length,
        from: oosSourceCandles[0]?.timestamp,
        to: oosSourceCandles[oosSourceCandles.length - 1]?.timestamp,
      };
      if (split.outOfSample.length >= 2) {
        const oosRun = engine.run({ ...baseConfig(spec, split.outOfSample), costs: REALISTIC_COST_SCENARIO }, split.outOfSample);
        oosExpectancyR = oosRun.metrics?.expectancyR;
      }

      progress.log({ stage: "Stage 6", strategy: spec.label }, { increment: false });

      // --- Stage 6: walk-forward (on the 2yr dataset) ---
      const wfConfig = walkForwardConfigFor(spec.timeframe);
      const windows = buildWalkForwardWindows(recentCandles, wfConfig);
      if (windows.length > 0) {
        const results = runWalkForwardWindows(engine, { ...baseConfig(spec, recentCandles), costs: REALISTIC_COST_SCENARIO }, windows);
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

      // --- Stage 7: cross-asset (single-asset strategies only — pairs are inherently cross-asset already) ---
      if (spec.kind === "SINGLE_ASSET") {
        progress.log({ stage: "Stage 7", strategy: spec.label }, { increment: false });
        for (const asset of CROSS_ASSETS) {
          const assetCandles = await fetchCandlesCached(provider, asset, spec.timeframe, recentFrom);
          crossAssetTestedCount += 1;
          if (!assetCandles || assetCandles.length === 0) {
            crossAssetDetail[asset] = undefined;
            continue;
          }
          const assetSpec = { ...spec, market: asset };
          const assetRun = engine.run({ ...baseConfig(assetSpec, assetCandles), costs: REALISTIC_COST_SCENARIO }, assetCandles);
          crossAssetDetail[asset] = assetRun.metrics?.expectancyR;
          if ((assetRun.metrics?.expectancyR ?? 0) > 0) crossAssetPositiveCount += 1;
        }
      }

      // --- Stage 9: Monte Carlo (Stage 8/regime reads straight from realisticRun.metrics.performanceByRegime — no extra compute) ---
      progress.log({ stage: "Stage 9", strategy: spec.label }, { increment: false });
      if (realisticRun && realisticRun.trades.length > 0) {
        monteCarloResult = runMonteCarloSimulation(realisticRun.trades, INITIAL_CAPITAL, RISK_PER_TRADE_PCT);
      }
    }

    const performanceByRegime = realisticRun?.metrics?.performanceByRegime ?? {};
    const positiveRegimeCount = Object.values(performanceByRegime).filter(
      (m) => m !== undefined && m.totalTrades >= 10 && m.expectancyR > 0,
    ).length;

    const summary: FunnelSummary = {
      sanityPassed,
      zeroCostExpectancyR,
      realisticCostExpectancyR,
      breakEvenBps: breakEven?.breakEvenBps ?? null,
      oosExpectancyR,
      walkForwardPositiveWindowPct: walkForwardSummary?.positivePct,
      walkForwardWindowCount: walkForwardSummary?.windowCount ?? 0,
      sampleQuality: realisticRun?.metrics?.sampleQuality ?? stage1Run.metrics?.sampleQuality ?? "INSUFFICIENT",
      crossAssetPositiveCount,
      crossAssetTestedCount,
      monteCarloDrawdownP95Pct: monteCarloResult?.maxDrawdownPct.p95,
      positiveRegimeCount,
    };
    const { classification, reasons } = classifyStrategy(summary);

    const record = createExperimentRecord(
      {
        strategyId: spec.strategyId,
        strategyVersion: manager.getRegistration(spec.strategyId)?.strategy.version ?? "unknown",
        parameters: spec.parameters,
        market: spec.market,
        timeframe: spec.timeframe,
        datasetFrom: recentCandles[0].timestamp,
        datasetTo: recentCandles[recentCandles.length - 1].timestamp,
        costs: REALISTIC_COST_SCENARIO,
        executionMode: "MARKET",
      },
      { gitCommit: commit, classification },
    );

    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          id: spec.id,
          spec,
          record,
          summary,
          classification,
          reasons,
          costSensitivity: costPoints,
          breakEven,
          costRobustness: breakEven ? classifyCostRobustness(breakEven) : undefined,
          longHistory: longHistoryInfo,
          walkForward: walkForwardSummary,
          crossAssetDetail,
          performanceByRegime,
          monteCarlo: monteCarloResult,
          stage1TradeCount: stage1Run.trades.length,
          realisticTradeCount: realisticRun?.trades.length,
        },
        null,
        2,
      ),
    );

    progress.log({ stage: `Done (${classification})`, strategy: spec.label });
  }

  console.log(`\n=== Block 5 funnel complete. Results in ${STAGE_RESULTS_DIR} ===`);
}

main().catch((error) => {
  console.error("[block5-funnel] Unhandled error:", error);
  process.exitCode = 1;
});
