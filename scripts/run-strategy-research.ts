/**
 * Block 4.5 — Strategy & Execution Research, Phases 2/3/5/6/7.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/run-strategy-research.ts
 *
 * Scope (see /root/.claude/plans/precious-brewing-token.md "Alcance
 * computacional" for the full rationale): every phase here runs
 * FULL-PERIOD metrics only (Phase 6 additionally runs the 3-way
 * chronological split it explicitly asks for) — never the full
 * walk-forward/Monte Carlo/regime pipeline, which is reserved
 * (Phase 8, `run-block45-deep-validation.ts`) for whichever
 * combinations actually look promising here. This keeps the total
 * runtime bounded (~40 full-period runs instead of hundreds of
 * multi-hour pipelines) while still directly answering every question
 * these 5 phases ask.
 *
 *   Phase 2 — cost sensitivity: MR/ORB at 0/0.5/1/2/3/5/7.5/10 bps,
 *             everything else held constant, plus an interpolated
 *             break-even cost.
 *   Phase 3 — spread vs. slippage isolated: none / spread-only /
 *             slippage-only / both.
 *   Phase 5 — timeframe generalization: MR at 5m/15m/30m/1h, ORB at
 *             1m/5m/15m/30m, same rules/parameters, no per-timeframe
 *             tuning.
 *   Phase 6 — longest reliable history available (SPY, `sip` feed),
 *             full-period + a 2016-2022/2023-2024/2025-2026
 *             chronological split (falls back to a proportional
 *             60/20/20 split, documented, if the actual data doesn't
 *             reach back to 2016).
 *   Phase 7 — cross-asset: SPY/QQQ/IWM/DIA, same rules/parameters, no
 *             per-asset tuning.
 *
 * Every result is written to `.block4-5-results/<phase>/<id>.json` the
 * moment it's computed — a interrupted/restarted run skips whatever
 * file already exists instead of re-paying the computation.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "./lib/sandbox-io";
setupSandboxIO();

import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import type { Candle, MarketDataProvider } from "@/core/market-data/types";
import {
  DEFAULT_SAME_CANDLE_POLICY,
  REALISTIC_COST_SCENARIO,
  ZERO_COST_BASELINE,
  type BacktestConfig,
  type BacktestRun,
  type ExecutionCostConfig,
} from "@/core/backtesting/types";
import { createEventDrivenBacktestEngine } from "@/core/backtesting/event-driven-simulator";
import { getDefaultStrategyManager } from "@/core/strategy-manager/registry";
import type { Market, Timeframe } from "@/core/shared/types";

const OUTPUT_ROOT = join(process.cwd(), ".block4-5-results");
const INITIAL_CAPITAL = 10_000;
const RISK_PER_TRADE_PCT = 0.5;
const DEFAULT_YEARS_BACK = 2;
const LONG_HISTORY_FROM = "2016-01-01T00:00:00.000Z"; // Alpaca `sip` was empirically found reliable back to ~2016 for SPY (Block 4)

const STRATEGY_LABELS: Record<string, string> = { "mean-reversion": "MR", "opening-range-breakout": "ORB" };
const NATIVE_TIMEFRAME: Record<string, Timeframe> = { "mean-reversion": "15m", "opening-range-breakout": "5m" };
const MR_TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m", "1h"];
const ORB_TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m"];
const CROSS_ASSETS: Array<{ market: Market; ticker: string }> = [
  { market: "SP500", ticker: "SPY" },
  { market: "NASDAQ100", ticker: "QQQ" },
  { market: "RUSSELL2000", ticker: "IWM" },
  { market: "DOWJONES", ticker: "DIA" },
];
const COST_SENSITIVITY_BPS = [0, 0.5, 1, 2, 3, 5, 7.5, 10];

function log(...args: unknown[]): void {
  console.log(...args);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** bps=5 is exactly REALISTIC_COST_SCENARIO (0.0005 slippagePct, $0.005 halfSpread) — every other level scales both components proportionally from that reference point. Documented explicitly in the report; never presented as anything but a defined convention. */
function costsForBps(bps: number): ExecutionCostConfig {
  const scale = bps / 5;
  return { commissionPerFill: 0, slippagePct: 0.0005 * scale, halfSpread: 0.005 * scale };
}

interface ExperimentSpec {
  id: string;
  phase: string;
  strategyId: string;
  market: Market;
  timeframe: Timeframe;
  costLabel: string;
  costs: ExecutionCostConfig;
  candleCacheKey: string;
  fromOverride?: string;
  outputPath: string;
}

function buildExperimentList(): ExperimentSpec[] {
  const specs: ExperimentSpec[] = [];
  const strategyIds = ["mean-reversion", "opening-range-breakout"];

  // Phase 2 — cost sensitivity
  for (const strategyId of strategyIds) {
    const timeframe = NATIVE_TIMEFRAME[strategyId];
    for (const bps of COST_SENSITIVITY_BPS) {
      const bpsLabel = `${bps}bps`;
      specs.push({
        id: `phase2-cost-sensitivity/${strategyId}-${bpsLabel}`,
        phase: "phase2-cost-sensitivity",
        strategyId,
        market: "SP500",
        timeframe,
        costLabel: bpsLabel,
        costs: costsForBps(bps),
        candleCacheKey: `SP500|${timeframe}|${DEFAULT_YEARS_BACK}`,
        outputPath: join(OUTPUT_ROOT, "phase2-cost-sensitivity", `${strategyId}-${bpsLabel}.json`),
      });
    }
  }

  // Phase 3 — spread vs slippage isolated
  const componentScenarios: Array<{ label: string; costs: ExecutionCostConfig }> = [
    { label: "none", costs: ZERO_COST_BASELINE },
    { label: "spread-only", costs: { commissionPerFill: 0, slippagePct: 0, halfSpread: 0.005 } },
    { label: "slippage-only", costs: { commissionPerFill: 0, slippagePct: 0.0005, halfSpread: 0 } },
    { label: "both", costs: REALISTIC_COST_SCENARIO },
  ];
  for (const strategyId of strategyIds) {
    const timeframe = NATIVE_TIMEFRAME[strategyId];
    for (const scenario of componentScenarios) {
      specs.push({
        id: `phase3-cost-components/${strategyId}-${scenario.label}`,
        phase: "phase3-cost-components",
        strategyId,
        market: "SP500",
        timeframe,
        costLabel: scenario.label,
        costs: scenario.costs,
        candleCacheKey: `SP500|${timeframe}|${DEFAULT_YEARS_BACK}`,
        outputPath: join(OUTPUT_ROOT, "phase3-cost-components", `${strategyId}-${scenario.label}.json`),
      });
    }
  }

  // Phase 5 — timeframe generalization
  for (const [strategyId, timeframes] of [
    ["mean-reversion", MR_TIMEFRAMES],
    ["opening-range-breakout", ORB_TIMEFRAMES],
  ] as const) {
    for (const timeframe of timeframes) {
      specs.push({
        id: `phase5-timeframes/${strategyId}-${timeframe}`,
        phase: "phase5-timeframes",
        strategyId,
        market: "SP500",
        timeframe,
        costLabel: "realistic",
        costs: REALISTIC_COST_SCENARIO,
        candleCacheKey: `SP500|${timeframe}|${DEFAULT_YEARS_BACK}`,
        outputPath: join(OUTPUT_ROOT, "phase5-timeframes", `${strategyId}-${timeframe}.json`),
      });
    }
  }

  // Phase 6 — long history (full-period only here; the 3-way split is
  // computed as a post-processing step on the same fetched candles,
  // inside runExperiment, not as a separate engine.run()).
  for (const strategyId of strategyIds) {
    const timeframe = NATIVE_TIMEFRAME[strategyId];
    specs.push({
      id: `phase6-long-history/${strategyId}`,
      phase: "phase6-long-history",
      strategyId,
      market: "SP500",
      timeframe,
      costLabel: "realistic",
      costs: REALISTIC_COST_SCENARIO,
      candleCacheKey: `SP500|${timeframe}|LONG`,
      fromOverride: LONG_HISTORY_FROM,
      outputPath: join(OUTPUT_ROOT, "phase6-long-history", `${strategyId}.json`),
    });
  }

  // Phase 7 — cross-asset
  for (const strategyId of strategyIds) {
    const timeframe = NATIVE_TIMEFRAME[strategyId];
    for (const asset of CROSS_ASSETS) {
      specs.push({
        id: `phase7-cross-asset/${strategyId}-${asset.market}`,
        phase: "phase7-cross-asset",
        strategyId,
        market: asset.market,
        timeframe,
        costLabel: "realistic",
        costs: REALISTIC_COST_SCENARIO,
        candleCacheKey: `${asset.market}|${timeframe}|${DEFAULT_YEARS_BACK}`,
        outputPath: join(OUTPUT_ROOT, "phase7-cross-asset", `${strategyId}-${asset.market}.json`),
      });
    }
  }

  return specs;
}

const candleCache = new Map<string, Candle[]>();

async function getCandles(
  provider: MarketDataProvider,
  market: Market,
  timeframe: Timeframe,
  fromOverride: string | undefined,
): Promise<Candle[] | undefined> {
  const cacheKey = fromOverride ? `${market}|${timeframe}|LONG` : `${market}|${timeframe}|${DEFAULT_YEARS_BACK}`;
  const cached = candleCache.get(cacheKey);
  if (cached) return cached;

  const from = fromOverride ?? new Date(Date.now() - DEFAULT_YEARS_BACK * 365.25 * 24 * 60 * 60 * 1000).toISOString();
  const result = await provider.getHistoricalCandles({ market, timeframe, from });
  if (!result.ok) {
    log(`  [fetch failed] ${market}/${timeframe}: ${result.error.code} — ${result.error.message}`);
    return undefined;
  }
  const candles = result.value.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  candleCache.set(cacheKey, candles);
  return candles;
}

function baseConfig(strategyId: string, market: Market, timeframe: Timeframe, candles: Candle[]): Omit<BacktestConfig, "costs"> {
  return {
    name: `research-${strategyId}-${market}-${timeframe}`,
    market,
    timeframe,
    mode: "SINGLE_STRATEGY",
    strategyIds: [strategyId],
    dateFrom: candles[0].timestamp,
    dateTo: candles[candles.length - 1].timestamp,
    initialCapital: INITIAL_CAPITAL,
    riskPerTradePct: RISK_PER_TRADE_PCT,
    commission: 0,
    slippage: 0,
    sameCandlePolicy: DEFAULT_SAME_CANDLE_POLICY,
  };
}

function trimRun(run: BacktestRun) {
  // Keep the file sizes sane — full trade lists for ~40 combinations
  // would be tens of MB of near-duplicate detail already captured by
  // Block 4's per-strategy trade audit. Metrics (including every
  // breakdown) and a trade COUNT/sample are what §Phase-2..7 need.
  return {
    status: run.status,
    errorMessage: run.errorMessage,
    metrics: run.metrics,
    tradeCount: run.trades.length,
    noFillCount: run.noFillCount,
  };
}

/** Splits candles at fixed calendar boundaries; falls back to a proportional 60/20/20 index split (documented) if the data doesn't actually reach back far enough for the boundaries to make sense. */
function longHistorySplit(candles: Candle[]) {
  const devEnd = new Date("2023-01-01T00:00:00.000Z").getTime();
  const validationEnd = new Date("2025-01-01T00:00:00.000Z").getTime();
  const actualStart = new Date(candles[0].timestamp).getTime();

  if (actualStart < devEnd - 180 * 24 * 60 * 60 * 1000) {
    // At least ~6 months of data before the dev/validation boundary — the calendar split is meaningful.
    const dev = candles.filter((c) => new Date(c.timestamp).getTime() < devEnd);
    const validation = candles.filter((c) => {
      const t = new Date(c.timestamp).getTime();
      return t >= devEnd && t < validationEnd;
    });
    const outOfSample = candles.filter((c) => new Date(c.timestamp).getTime() >= validationEnd);
    return {
      method: "CALENDAR_BOUNDARIES" as const,
      note: "2016-2022 dev / 2023-2024 validation / 2025-2026 out-of-sample, as requested.",
      dev,
      validation,
      outOfSample,
    };
  }

  // Fallback: proportional split, documented as a deviation from the requested calendar boundaries.
  const trainCount = Math.floor(candles.length * 0.6);
  const validationCount = Math.floor(candles.length * 0.2);
  return {
    method: "PROPORTIONAL_FALLBACK" as const,
    note: `Actual data only starts at ${candles[0].timestamp} — too close to (or past) the requested 2023-01-01 boundary for a meaningful calendar split. Fell back to a proportional 60/20/20 chronological split instead.`,
    dev: candles.slice(0, trainCount),
    validation: candles.slice(trainCount, trainCount + validationCount),
    outOfSample: candles.slice(trainCount + validationCount),
  };
}

async function runExperiment(
  spec: ExperimentSpec,
  provider: MarketDataProvider,
  engine: ReturnType<typeof createEventDrivenBacktestEngine>,
): Promise<void> {
  mkdirSync(join(OUTPUT_ROOT, spec.phase), { recursive: true });

  const candles = await getCandles(provider, spec.market, spec.timeframe, spec.fromOverride);
  if (!candles || candles.length === 0) {
    writeFileSync(spec.outputPath, JSON.stringify({ status: "FETCH_FAILED", spec }, null, 2));
    return;
  }

  const common = baseConfig(spec.strategyId, spec.market, spec.timeframe, candles);
  let fullRun: BacktestRun;
  try {
    fullRun = engine.run({ ...common, costs: spec.costs }, candles);
  } catch (error) {
    writeFileSync(
      spec.outputPath,
      JSON.stringify({ status: "SIMULATION_FAILED", reason: String(error), spec, candleCount: candles.length }, null, 2),
    );
    return;
  }

  const output: Record<string, unknown> = {
    spec: { ...spec, costs: spec.costs },
    dataset: { from: candles[0].timestamp, to: candles[candles.length - 1].timestamp, candleCount: candles.length },
    full: trimRun(fullRun),
  };

  if (spec.phase === "phase6-long-history") {
    const split = longHistorySplit(candles);
    output.split = {
      method: split.method,
      note: split.note,
      dev: {
        period: { from: split.dev[0]?.timestamp, to: split.dev[split.dev.length - 1]?.timestamp, candleCount: split.dev.length },
        run: split.dev.length >= 2 ? trimRun(engine.run({ ...common, costs: spec.costs, dateFrom: split.dev[0].timestamp, dateTo: split.dev[split.dev.length - 1].timestamp }, split.dev)) : undefined,
      },
      validation: {
        period: {
          from: split.validation[0]?.timestamp,
          to: split.validation[split.validation.length - 1]?.timestamp,
          candleCount: split.validation.length,
        },
        run:
          split.validation.length >= 2
            ? trimRun(
                engine.run(
                  { ...common, costs: spec.costs, dateFrom: split.validation[0].timestamp, dateTo: split.validation[split.validation.length - 1].timestamp },
                  split.validation,
                ),
              )
            : undefined,
      },
      outOfSample: {
        period: {
          from: split.outOfSample[0]?.timestamp,
          to: split.outOfSample[split.outOfSample.length - 1]?.timestamp,
          candleCount: split.outOfSample.length,
        },
        run:
          split.outOfSample.length >= 2
            ? trimRun(
                engine.run(
                  { ...common, costs: spec.costs, dateFrom: split.outOfSample[0].timestamp, dateTo: split.outOfSample[split.outOfSample.length - 1].timestamp },
                  split.outOfSample,
                ),
              )
            : undefined,
      },
    };
  }

  writeFileSync(spec.outputPath, JSON.stringify(output, null, 2));
}

function computeBreakEvenCost(points: Array<{ bps: number; expectancyR: number }>): { breakEvenBps: number | null; note: string } {
  const sorted = [...points].sort((a, b) => a.bps - b.bps);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const crosses = (a.expectancyR >= 0 && b.expectancyR < 0) || (a.expectancyR < 0 && b.expectancyR >= 0);
    if (crosses) {
      const t = (0 - a.expectancyR) / (b.expectancyR - a.expectancyR);
      const breakEvenBps = a.bps + t * (b.bps - a.bps);
      return { breakEvenBps, note: `Linearly interpolated between ${a.bps}bps (expectancyR=${a.expectancyR.toFixed(4)}) and ${b.bps}bps (expectancyR=${b.expectancyR.toFixed(4)}).` };
    }
  }
  if (sorted.every((p) => p.expectancyR < 0)) {
    return { breakEvenBps: null, note: "Expectancy is already negative at 0bps — there is no positive break-even cost; the strategy has no edge to begin with at this sample." };
  }
  return {
    breakEvenBps: null,
    note: `Expectancy stays >= 0 across the entire tested range (0-${sorted[sorted.length - 1].bps}bps) — the break-even cost is beyond what was tested here.`,
  };
}

async function main() {
  mkdirSync(OUTPUT_ROOT, { recursive: true });

  const providerResult = createMarketDataProvider();
  if (!providerResult.ok) {
    log(`[research] Market data provider unavailable: ${providerResult.error.message}`);
    process.exitCode = 1;
    return;
  }
  const provider = providerResult.value;
  const manager = getDefaultStrategyManager();
  const engine = createEventDrivenBacktestEngine(manager);

  const specs = buildExperimentList();
  const total = specs.length;
  const startTime = Date.now();
  let completed = 0;

  for (const spec of specs) {
    if (existsSync(spec.outputPath)) {
      completed += 1;
      log(`[Block 4.5] ${completed}/${total} experiments completed (${((completed / total) * 100).toFixed(1)}%) | ${STRATEGY_LABELS[spec.strategyId]} | ${spec.market} | ${spec.timeframe} | ${spec.costLabel} | elapsed ${formatDuration(Date.now() - startTime)} | (cached, skipped)`);
      continue;
    }

    await runExperiment(spec, provider, engine);
    completed += 1;
    log(`[Block 4.5] ${completed}/${total} experiments completed (${((completed / total) * 100).toFixed(1)}%) | ${STRATEGY_LABELS[spec.strategyId]} | ${spec.market} | ${spec.timeframe} | ${spec.costLabel} | elapsed ${formatDuration(Date.now() - startTime)}`);
  }

  // --- Phase 2 post-processing: break-even cost per strategy ---
  const breakEvenByStrategy: Record<string, unknown> = {};
  for (const strategyId of ["mean-reversion", "opening-range-breakout"]) {
    const points: Array<{ bps: number; expectancyR: number }> = [];
    for (const bps of COST_SENSITIVITY_BPS) {
      const path = join(OUTPUT_ROOT, "phase2-cost-sensitivity", `${strategyId}-${bps}bps.json`);
      if (!existsSync(path)) continue;
      const data = JSON.parse(readFileSync(path, "utf8"));
      const expectancyR = data.full?.metrics?.expectancyR;
      if (typeof expectancyR === "number") points.push({ bps, expectancyR });
    }
    breakEvenByStrategy[strategyId] = { points, ...computeBreakEvenCost(points) };
  }

  writeFileSync(
    join(OUTPUT_ROOT, "phase2-break-even-cost.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), breakEvenByStrategy }, null, 2),
  );
  log("\n=== Break-even cost ===");
  log(JSON.stringify(breakEvenByStrategy, null, 2));

  log(`\n=== Strategy research (Phases 2,3,5,6,7) complete. ${completed}/${total} experiments. Results in ${OUTPUT_ROOT} ===`);
}

main().catch((error) => {
  console.error("[research] Unhandled error:", error);
  process.exitCode = 1;
});
