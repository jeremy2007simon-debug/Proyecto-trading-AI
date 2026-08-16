/**
 * Block 4.5, Phase 8 — deep validation of whatever looked promising in
 * Phases 2/3/5/6/7.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/run-block45-deep-validation.ts
 *
 * Must run AFTER `run-strategy-research.ts` — it reads that script's
 * output from `.block4-5-results/phase{2,3,5,6,7}/*.json` to decide
 * what counts as "promising": full-period expectancyR > 0 at realistic
 * cost, and — for the one phase that already has an out-of-sample split
 * (Phase 6, long history) — a positive out-of-sample expectancyR too.
 * Only promising (strategyId, market, timeframe) combinations get the
 * full pipeline here: full-period, a fresh 60/20/20 out-of-sample
 * split, walk-forward, Monte Carlo. `performanceByRegime` is already
 * part of every `BacktestMetrics` the engine produces, so no separate
 * regime step is needed.
 *
 * If nothing qualifies, this writes `phase8/NO_CANDIDATES.json` with
 * exactly what was checked and why nothing passed — a legitimate,
 * expected outcome per the spec ("prefiero NO VALID STRATEGY FOUND
 * antes que forzar un candidato"), not a script failure.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "./lib/sandbox-io";
setupSandboxIO();

import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import type { Candle } from "@/core/market-data/types";
import { DEFAULT_SAME_CANDLE_POLICY, REALISTIC_COST_SCENARIO, type BacktestConfig } from "@/core/backtesting/types";
import { describeDatasetSplit, splitCandlesChronologically } from "@/core/backtesting/dataset-split";
import { createEventDrivenBacktestEngine } from "@/core/backtesting/event-driven-simulator";
import { runMonteCarloSimulation } from "@/core/backtesting/monte-carlo";
import { buildWalkForwardWindows, runWalkForwardWindows } from "@/core/backtesting/walk-forward";
import { getDefaultStrategyManager } from "@/core/strategy-manager/registry";
import { TIMEFRAME_MINUTES } from "@/core/shared/timeframe";
import type { Market, Timeframe } from "@/core/shared/types";

const RESULTS_ROOT = join(process.cwd(), ".block4-5-results");
const OUTPUT_DIR = join(RESULTS_ROOT, "phase8");
const INITIAL_CAPITAL = 10_000;
const RISK_PER_TRADE_PCT = 0.5;
const RTH_MINUTES_PER_DAY = 390;

function log(...args: unknown[]): void {
  console.log(...args);
}

interface PromisingCombo {
  source: string;
  strategyId: string;
  market: Market;
  timeframe: Timeframe;
  fullExpectancyR: number;
  oosExpectancyR?: number;
}

/** Loose shape of a `run-strategy-research.ts` output file — only the fields this script actually reads. */
interface ResearchResultFile {
  spec?: { strategyId: string; market: Market; timeframe: Timeframe; costLabel: string };
  full?: { metrics?: { expectancyR: number } };
  split?: { outOfSample?: { run?: { metrics?: { expectancyR: number } } } };
}

function readJson(path: string): ResearchResultFile {
  return JSON.parse(readFileSync(path, "utf8")) as ResearchResultFile;
}

/** Scans a Phase 2-7 output directory for full-period expectancyR > 0 (Phase 6 additionally needs its own out-of-sample split to be positive too). */
function findPromisingCombos(): PromisingCombo[] {
  const found: PromisingCombo[] = [];
  const phaseDirs = ["phase2-cost-sensitivity", "phase3-cost-components", "phase5-timeframes", "phase6-long-history", "phase7-cross-asset"];

  for (const phaseDir of phaseDirs) {
    const dir = join(RESULTS_ROOT, phaseDir);
    if (!existsSync(dir)) continue;

    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      const data = readJson(join(dir, file));
      const spec = data.spec;
      if (!spec) continue;

      // Phase 2/3 sweep multiple cost levels per strategy — only the
      // realistic-cost point (bps label "5bps" or cost label "both") is
      // eligible as "promising" (per-cost-level results belong in the
      // sensitivity report, not the promotion decision).
      if (phaseDir === "phase2-cost-sensitivity" && spec.costLabel !== "5bps") continue;
      if (phaseDir === "phase3-cost-components" && spec.costLabel !== "both") continue;

      const fullExpectancyR = data.full?.metrics?.expectancyR;
      if (typeof fullExpectancyR !== "number" || fullExpectancyR <= 0) continue;

      if (phaseDir === "phase6-long-history") {
        const oosExpectancyR = data.split?.outOfSample?.run?.metrics?.expectancyR;
        if (typeof oosExpectancyR !== "number" || oosExpectancyR <= 0) continue;
        found.push({ source: file, strategyId: spec.strategyId, market: spec.market, timeframe: spec.timeframe, fullExpectancyR, oosExpectancyR });
        continue;
      }

      found.push({ source: `${phaseDir}/${file}`, strategyId: spec.strategyId, market: spec.market, timeframe: spec.timeframe, fullExpectancyR });
    }
  }

  // De-duplicate by (strategyId, market, timeframe) — several phases can
  // surface the SAME combo (e.g. Phase 2's realistic point and Phase 7's
  // SPY entry are both mean-reversion/SP500/15m).
  const seen = new Map<string, PromisingCombo>();
  for (const combo of found) {
    const key = `${combo.strategyId}|${combo.market}|${combo.timeframe}`;
    if (!seen.has(key)) seen.set(key, combo);
  }
  return [...seen.values()];
}

function walkForwardConfigFor(timeframe: Timeframe, totalCandles: number) {
  const barsPerDay = Math.max(1, Math.round(RTH_MINUTES_PER_DAY / TIMEFRAME_MINUTES[timeframe]));
  const trainBars = barsPerDay * 126;
  const validationBars = barsPerDay * 21;
  const forwardBars = barsPerDay * 21;
  const stepBars = forwardBars;
  if (totalCandles < trainBars + validationBars + forwardBars) return undefined;
  return { trainBars, validationBars, forwardBars, stepBars };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  if (!existsSync(RESULTS_ROOT) || readdirSync(RESULTS_ROOT).length === 0) {
    log("[phase8] No Phase 2-7 results found — run scripts/run-strategy-research.ts first.");
    process.exitCode = 1;
    return;
  }

  const promising = findPromisingCombos();
  log(`[phase8] ${promising.length} promising combination(s) found:`);
  for (const c of promising) log(`  - ${c.strategyId} / ${c.market} / ${c.timeframe} (fullExpR=${c.fullExpectancyR.toFixed(3)}${c.oosExpectancyR !== undefined ? `, oosExpR=${c.oosExpectancyR.toFixed(3)}` : ""}, source=${c.source})`);

  if (promising.length === 0) {
    writeFileSync(
      join(OUTPUT_DIR, "NO_CANDIDATES.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          reason:
            "No (strategy, market, timeframe) combination showed positive expectancyR at realistic cost in Phases 2/3/5/6/7 " +
            "(Phase 6 combos additionally required a positive out-of-sample expectancyR). No deep validation was run — " +
            "there is nothing that qualifies as a promising candidate on this real data.",
        },
        null,
        2,
      ),
    );
    log("\n[phase8] NO CANDIDATES. Wrote NO_CANDIDATES.json. This is a valid, expected outcome — not a script failure.");
    return;
  }

  const providerResult = createMarketDataProvider();
  if (!providerResult.ok) {
    log(`[phase8] Market data provider unavailable: ${providerResult.error.message}`);
    process.exitCode = 1;
    return;
  }
  const provider = providerResult.value;
  const manager = getDefaultStrategyManager();
  const engine = createEventDrivenBacktestEngine(manager);

  for (const combo of promising) {
    const outputPath = join(OUTPUT_DIR, `${combo.strategyId}-${combo.market}-${combo.timeframe}.json`);
    if (existsSync(outputPath)) {
      log(`[phase8] ${combo.strategyId}/${combo.market}/${combo.timeframe} already validated (cached), skipping.`);
      continue;
    }

    log(`\n=== Deep validation: ${combo.strategyId} / ${combo.market} / ${combo.timeframe} ===`);
    const to = new Date();
    const from = new Date(to.getTime() - 2 * 365.25 * 24 * 60 * 60 * 1000);
    const fetchResult = await provider.getHistoricalCandles({ market: combo.market, timeframe: combo.timeframe, from: from.toISOString() });
    if (!fetchResult.ok) {
      log(`[phase8] Fetch failed: ${fetchResult.error.code} — ${fetchResult.error.message}`);
      continue;
    }
    const candles: Candle[] = fetchResult.value.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const common: Omit<BacktestConfig, "costs"> = {
      name: `phase8-${combo.strategyId}-${combo.market}-${combo.timeframe}`,
      market: combo.market,
      timeframe: combo.timeframe,
      mode: "SINGLE_STRATEGY",
      strategyIds: [combo.strategyId],
      dateFrom: candles[0].timestamp,
      dateTo: candles[candles.length - 1].timestamp,
      initialCapital: INITIAL_CAPITAL,
      riskPerTradePct: RISK_PER_TRADE_PCT,
      commission: 0,
      slippage: 0,
      sameCandlePolicy: DEFAULT_SAME_CANDLE_POLICY,
    };

    const fullRun = engine.run({ ...common, costs: REALISTIC_COST_SCENARIO }, candles);
    log(`[phase8] full-period: ${fullRun.trades.length} trades, expectancyR=${fullRun.metrics?.expectancyR.toFixed(3)}`);

    const split = splitCandlesChronologically(candles);
    const splitDescription = describeDatasetSplit(split);
    const oosRun = engine.run(
      { ...common, costs: REALISTIC_COST_SCENARIO, dateFrom: splitDescription.outOfSample.from, dateTo: splitDescription.outOfSample.to },
      split.outOfSample,
    );
    log(`[phase8] out-of-sample: ${oosRun.trades.length} trades, expectancyR=${oosRun.metrics?.expectancyR.toFixed(3)}`);

    const wfConfig = walkForwardConfigFor(combo.timeframe, candles.length);
    let walkForwardResults: ReturnType<typeof runWalkForwardWindows> = [];
    if (wfConfig) {
      const windows = buildWalkForwardWindows(candles, wfConfig);
      walkForwardResults = runWalkForwardWindows(engine, { ...common, costs: REALISTIC_COST_SCENARIO }, windows);
      log(`[phase8] walk-forward: ${windows.length} window(s)`);
    } else {
      log(`[phase8] walk-forward: skipped (insufficient sample for a full window)`);
    }

    const monteCarlo = runMonteCarloSimulation(fullRun.trades, INITIAL_CAPITAL, RISK_PER_TRADE_PCT, 1000, 42);

    const forwardWindows = walkForwardResults.map((w) => ({
      windowIndex: w.windowIndex,
      forwardTrades: w.forward.metrics?.totalTrades ?? 0,
      forwardExpectancyR: w.forward.metrics?.expectancyR ?? null,
      forwardNetProfit: w.forward.metrics?.netProfit ?? null,
    }));
    const withTrades = forwardWindows.filter((w) => w.forwardTrades > 0);
    const profitableWindows = withTrades.filter((w) => (w.forwardNetProfit ?? 0) > 0);

    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          combo,
          dataset: { from: candles[0].timestamp, to: candles[candles.length - 1].timestamp, candleCount: candles.length },
          fullPeriod: { status: fullRun.status, metrics: fullRun.metrics, tradeCount: fullRun.trades.length },
          outOfSample: { status: oosRun.status, metrics: oosRun.metrics, tradeCount: oosRun.trades.length, period: splitDescription.outOfSample },
          walkForward: {
            config: wfConfig,
            windowCount: forwardWindows.length,
            windowsWithTrades: withTrades.length,
            profitableForwardWindows: profitableWindows.length,
            windows: forwardWindows,
          },
          monteCarlo,
        },
        null,
        2,
      ),
    );
  }

  log(`\n=== Phase 8 deep validation complete. Results in ${OUTPUT_DIR} ===`);
}

main().catch((error) => {
  console.error("[phase8] Unhandled error:", error);
  process.exitCode = 1;
});
