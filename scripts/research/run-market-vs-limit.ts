/**
 * Block 5, Fase 9 — Market vs Limit. Completes Block 4.5's Phase 4, which
 * was left `PENDING_EXTERNAL_DATA` after the sandbox's proxy blocked
 * `data.alpaca.markets` mid-session. Connectivity was re-confirmed at the
 * start of Block 5 (HTTP 200), so this runs the comparison for real.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/run-market-vs-limit.ts
 *
 * Reuses the event-driven engine's existing LIMIT execution mode
 * (built and unit-tested in Block 4.5, unchanged here) — no engine code
 * in this file, purely an experiment driver. Compares MARKET vs LIMIT
 * for Mean Reversion (15m) and Opening Range Breakout (5m) over the same
 * 2-year real SPY window used throughout Blocks 4 and 4.5, at the
 * realistic-cost scenario.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../lib/sandbox-io";
setupSandboxIO();

import { createProgressLogger } from "../lib/progress-logger";
import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import type { Candle } from "@/core/market-data/types";
import {
  DEFAULT_SAME_CANDLE_POLICY,
  REALISTIC_COST_SCENARIO,
  type BacktestConfig,
  type BacktestRun,
  type ExecutionMode,
} from "@/core/backtesting/types";
import { createEventDrivenBacktestEngine } from "@/core/backtesting/event-driven-simulator";
import { getResearchStrategyManager } from "@/core/strategy-manager/research-registry";
import type { Timeframe } from "@/core/shared/types";

const OUTPUT_DIR = join(process.cwd(), "results", "block5", "market-vs-limit");
const EXPERIMENT_YEARS = 2;
const INITIAL_CAPITAL = 10_000;
const RISK_PER_TRADE_PCT = 0.5;

const STRATEGIES: Array<{ id: string; label: string; timeframe: Timeframe }> = [
  { id: "mean-reversion", label: "MR", timeframe: "15m" },
  { id: "opening-range-breakout", label: "ORB", timeframe: "5m" },
];
const EXECUTION_MODES: ExecutionMode[] = ["MARKET", "LIMIT"];

function trimRun(run: BacktestRun) {
  return {
    status: run.status,
    errorMessage: run.errorMessage,
    metrics: run.metrics,
    tradeCount: run.trades.length,
    noFillCount: run.noFillCount,
    fillRatePct:
      run.noFillCount !== undefined && run.trades.length + run.noFillCount > 0
        ? (run.trades.length / (run.trades.length + run.noFillCount)) * 100
        : undefined,
  };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const providerResult = createMarketDataProvider();
  if (!providerResult.ok) {
    console.error(`[market-vs-limit] Market data provider unavailable: ${providerResult.error.message}`);
    process.exitCode = 1;
    return;
  }
  const provider = providerResult.value;
  const manager = getResearchStrategyManager();
  const engine = createEventDrivenBacktestEngine(manager);

  const total = STRATEGIES.length * EXECUTION_MODES.length;
  const progress = createProgressLogger(total);
  const comparisonByStrategy: Record<string, unknown> = {};

  for (const strategy of STRATEGIES) {
    const to = new Date();
    const from = new Date(to.getTime() - EXPERIMENT_YEARS * 365.25 * 24 * 60 * 60 * 1000);
    const fetchResult = await provider.getHistoricalCandles({ market: "SP500", timeframe: strategy.timeframe, from: from.toISOString() });
    if (!fetchResult.ok) {
      console.error(`[market-vs-limit] Fetch failed for ${strategy.id}: ${fetchResult.error.code} — ${fetchResult.error.message}`);
      for (const mode of EXECUTION_MODES) progress.log({ stage: "Market vs Limit", strategy: strategy.label, timeframe: strategy.timeframe, cost: mode });
      continue;
    }
    const candles: Candle[] = fetchResult.value.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const runsByMode: Record<string, ReturnType<typeof trimRun>> = {};
    for (const executionMode of EXECUTION_MODES) {
      const config: BacktestConfig = {
        name: `market-vs-limit-${strategy.id}-${executionMode}`,
        market: "SP500",
        timeframe: strategy.timeframe,
        mode: "SINGLE_STRATEGY",
        strategyIds: [strategy.id],
        dateFrom: candles[0].timestamp,
        dateTo: candles[candles.length - 1].timestamp,
        initialCapital: INITIAL_CAPITAL,
        riskPerTradePct: RISK_PER_TRADE_PCT,
        commission: 0,
        slippage: 0,
        costs: REALISTIC_COST_SCENARIO,
        sameCandlePolicy: DEFAULT_SAME_CANDLE_POLICY,
        executionMode,
      };
      const run = engine.run(config, candles);
      runsByMode[executionMode] = trimRun(run);
      progress.log({ stage: "Market vs Limit", strategy: strategy.label, timeframe: strategy.timeframe, cost: executionMode });
    }

    comparisonByStrategy[strategy.id] = {
      dataset: { from: candles[0].timestamp, to: candles[candles.length - 1].timestamp, candleCount: candles.length },
      runsByMode,
    };
  }

  writeFileSync(
    join(OUTPUT_DIR, "comparison.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), comparisonByStrategy }, null, 2),
  );
  console.log(`\n=== Market vs Limit complete. Results in ${OUTPUT_DIR} ===`);
}

main().catch((error) => {
  console.error("[market-vs-limit] Unhandled error:", error);
  process.exitCode = 1;
});
