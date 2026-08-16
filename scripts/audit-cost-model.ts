/**
 * Block 4.5, Phase 1 — cost-model audit.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/audit-cost-model.ts
 *
 * Reuses the real engine (Mean Reversion at 15m, Opening Range Breakout
 * at 5m, both over the same 2-year real SPY window used in Block 4, at
 * the realistic-cost scenario) and, for every closed trade, records the
 * full per-trade cost breakdown the Block 4.5 spec asked for: entry/exit
 * price, quantity, stop distance, risk in $ and %, spread paid,
 * entry/exit slippage, total cost in $/%/bps/R, and gross vs. net P&L.
 *
 * Every row is also checked against the algebraic invariants the engine
 * is supposed to guarantee — this is a BUG HUNT, not a report generator
 * that assumes the model is correct. A violated invariant is written to
 * `bugsFound` in the output and printed loudly; this script never
 * silently "fixes" a number to make the report look clean.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "./lib/sandbox-io";
setupSandboxIO();

import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import type { Candle } from "@/core/market-data/types";
import { REALISTIC_COST_SCENARIO, DEFAULT_SAME_CANDLE_POLICY, type BacktestConfig, type BacktestTrade } from "@/core/backtesting/types";
import { createEventDrivenBacktestEngine } from "@/core/backtesting/event-driven-simulator";
import { getDefaultStrategyManager } from "@/core/strategy-manager/registry";

const OUTPUT_DIR = join(process.cwd(), ".block4-5-results", "phase1-cost-audit");
const EXPERIMENT_YEARS = 2;
const INITIAL_CAPITAL = 10_000;
const RISK_PER_TRADE_PCT = 0.5;
const EPSILON = 1e-6; // $ tolerance for the algebraic invariants below

const STRATEGIES: Array<{ id: string; timeframe: BacktestConfig["timeframe"] }> = [
  { id: "mean-reversion", timeframe: "15m" },
  { id: "opening-range-breakout", timeframe: "5m" },
];

interface CostRow {
  strategyId: string;
  tradeId: string;
  direction: "BUY" | "SELL";
  entryAt: string;
  exitAt?: string;
  entryPrice: number;
  exitPrice?: number;
  positionSize: number;
  stopDistance: number;
  riskAmountUsd: number;
  riskPerTradePct: number;
  entrySpreadUsd: number;
  entrySlippageUsd: number;
  exitSpreadUsd: number;
  exitSlippageUsd: number;
  spreadTotalUsd: number;
  slippageTotalUsd: number;
  commissionUsd: number;
  costTotalUsd: number;
  costTotalPctOfRisk: number;
  costTotalPctOfNotional: number;
  costTotalBps: number;
  costInR: number;
  grossPnlUsd: number;
  netPnlUsd: number;
  pnlR?: number;
  exitReason?: string;
}

interface Invariant {
  tradeId: string;
  strategyId: string;
  check: string;
  detail: string;
}

function log(...args: unknown[]): void {
  console.log(...args);
}

function auditTrade(strategyId: string, trade: BacktestTrade, bugsFound: Invariant[]): CostRow {
  const notional = trade.positionSize * trade.entryPrice;
  const spreadTotalUsd = trade.entrySpreadAmount + trade.exitSpreadAmount;
  const slippageTotalUsd = trade.entrySlippageAmount + trade.exitSlippageAmount;
  const costTotalUsd = trade.commissionPaid + spreadTotalUsd + slippageTotalUsd;

  // --- invariant checks (never assume the model is right — verify it) ---
  if (trade.grossPnlAmount !== undefined && trade.pnlAmount !== undefined) {
    const expectedNet = trade.grossPnlAmount - costTotalUsd;
    if (Math.abs(expectedNet - trade.pnlAmount) > EPSILON) {
      bugsFound.push({
        tradeId: trade.id,
        strategyId,
        check: "GROSS_MINUS_COSTS_EQUALS_NET",
        detail: `grossPnl(${trade.grossPnlAmount}) - costs(${costTotalUsd}) = ${expectedNet}, but pnlAmount = ${trade.pnlAmount} (diff ${expectedNet - trade.pnlAmount})`,
      });
    }
  }
  if (trade.pnlAmount !== undefined && trade.pnlR !== undefined && trade.riskAmount > 0) {
    const expectedR = trade.pnlAmount / trade.riskAmount;
    if (Math.abs(expectedR - trade.pnlR) > 1e-9) {
      bugsFound.push({
        tradeId: trade.id,
        strategyId,
        check: "PNL_R_MATCHES_PNL_OVER_RISK",
        detail: `pnlAmount/riskAmount = ${expectedR}, but pnlR = ${trade.pnlR}`,
      });
    }
  }
  for (const [label, value] of [
    ["entrySpreadAmount", trade.entrySpreadAmount],
    ["entrySlippageAmount", trade.entrySlippageAmount],
    ["exitSpreadAmount", trade.exitSpreadAmount],
    ["exitSlippageAmount", trade.exitSlippageAmount],
    ["commissionPaid", trade.commissionPaid],
  ] as const) {
    if (value < 0) {
      bugsFound.push({ tradeId: trade.id, strategyId, check: "NO_NEGATIVE_COSTS", detail: `${label} = ${value}` });
    }
  }
  if (trade.exitReason === "TAKE_PROFIT" && (trade.exitSlippageAmount !== 0 || trade.exitSpreadAmount !== 0)) {
    bugsFound.push({
      tradeId: trade.id,
      strategyId,
      check: "TAKE_PROFIT_PAYS_NO_EXIT_COST",
      detail: `exitSlippage=${trade.exitSlippageAmount}, exitSpread=${trade.exitSpreadAmount}`,
    });
  }
  const legacySum = trade.entrySlippageAmount + trade.entrySpreadAmount + trade.exitSlippageAmount + trade.exitSpreadAmount;
  if (Math.abs(legacySum - trade.slippagePaid) > EPSILON) {
    bugsFound.push({
      tradeId: trade.id,
      strategyId,
      check: "SLIPPAGE_PAID_EQUALS_SUM_OF_BREAKDOWN",
      detail: `sum of 4 components = ${legacySum}, but slippagePaid = ${trade.slippagePaid}`,
    });
  }

  return {
    strategyId,
    tradeId: trade.id,
    direction: trade.direction,
    entryAt: trade.entryAt,
    exitAt: trade.exitAt,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    positionSize: trade.positionSize,
    stopDistance: Math.abs(trade.entryPrice - trade.stopLoss),
    riskAmountUsd: trade.riskAmount,
    riskPerTradePct: RISK_PER_TRADE_PCT,
    entrySpreadUsd: trade.entrySpreadAmount,
    entrySlippageUsd: trade.entrySlippageAmount,
    exitSpreadUsd: trade.exitSpreadAmount,
    exitSlippageUsd: trade.exitSlippageAmount,
    spreadTotalUsd,
    slippageTotalUsd,
    commissionUsd: trade.commissionPaid,
    costTotalUsd,
    costTotalPctOfRisk: trade.riskAmount > 0 ? (costTotalUsd / trade.riskAmount) * 100 : 0,
    costTotalPctOfNotional: notional > 0 ? (costTotalUsd / notional) * 100 : 0,
    costTotalBps: notional > 0 ? (costTotalUsd / notional) * 10_000 : 0,
    costInR: trade.riskAmount > 0 ? costTotalUsd / trade.riskAmount : 0,
    grossPnlUsd: trade.grossPnlAmount ?? Number.NaN,
    netPnlUsd: trade.pnlAmount ?? Number.NaN,
    pnlR: trade.pnlR,
    exitReason: trade.exitReason,
  };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function mean(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 50);
}

function summarize(rows: CostRow[]) {
  const costsUsd = rows.map((r) => r.costTotalUsd).sort((a, b) => a - b);
  const costsR = rows.map((r) => r.costInR);
  const totalGrossPnl = rows.reduce((s, r) => s + (Number.isFinite(r.grossPnlUsd) ? r.grossPnlUsd : 0), 0);
  const totalCosts = rows.reduce((s, r) => s + r.costTotalUsd, 0);
  const entryImpact = rows.reduce((s, r) => s + r.entrySpreadUsd + r.entrySlippageUsd, 0);
  const exitImpact = rows.reduce((s, r) => s + r.exitSpreadUsd + r.exitSlippageUsd, 0);
  const spreadImpact = rows.reduce((s, r) => s + r.spreadTotalUsd, 0);
  const slippageImpact = rows.reduce((s, r) => s + r.slippageTotalUsd, 0);

  return {
    tradeCount: rows.length,
    averageCostUsd: mean(costsUsd),
    medianCostUsd: median(costsUsd),
    averageCostR: mean(costsR),
    medianCostR: median(costsR),
    costPercentiles: {
      p10: percentile(costsUsd, 10),
      p25: percentile(costsUsd, 25),
      p50: percentile(costsUsd, 50),
      p75: percentile(costsUsd, 75),
      p90: percentile(costsUsd, 90),
    },
    totalGrossPnlUsd: totalGrossPnl,
    totalCostsUsd: totalCosts,
    // Only meaningful when the strategy has a positive gross edge to eat
    // into — documented explicitly, never silently coerced to a
    // misleading number when totalGrossPnl <= 0.
    costAsPctOfGrossEdge: totalGrossPnl > 0 ? (totalCosts / totalGrossPnl) * 100 : null,
    entryVsExitImpactUsd: { entry: entryImpact, exit: exitImpact },
    spreadVsSlippageImpactUsd: { spread: spreadImpact, slippage: slippageImpact },
  };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const providerResult = createMarketDataProvider();
  if (!providerResult.ok) {
    log(`[audit] Market data provider unavailable: ${providerResult.error.message}`);
    process.exitCode = 1;
    return;
  }
  const provider = providerResult.value;
  const manager = getDefaultStrategyManager();
  const engine = createEventDrivenBacktestEngine(manager);

  const bugsFound: Invariant[] = [];
  const allRowsByStrategy: Record<string, CostRow[]> = {};

  for (const { id: strategyId, timeframe } of STRATEGIES) {
    log(`\n=== Auditing ${strategyId} (${timeframe}) ===`);
    const to = new Date();
    const from = new Date(to.getTime() - EXPERIMENT_YEARS * 365.25 * 24 * 60 * 60 * 1000);

    const fetchResult = await provider.getHistoricalCandles({ market: "SP500", timeframe, from: from.toISOString() });
    if (!fetchResult.ok) {
      log(`[audit] Fetch failed for ${strategyId}: ${fetchResult.error.code} — ${fetchResult.error.message}`);
      continue;
    }
    const candles: Candle[] = fetchResult.value.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    log(`[audit] ${candles.length} candles, ${candles[0]?.timestamp} .. ${candles[candles.length - 1]?.timestamp}`);

    const config: BacktestConfig = {
      name: `audit-${strategyId}-${timeframe}`,
      market: "SP500",
      timeframe,
      mode: "SINGLE_STRATEGY",
      strategyIds: [strategyId],
      dateFrom: candles[0].timestamp,
      dateTo: candles[candles.length - 1].timestamp,
      initialCapital: INITIAL_CAPITAL,
      riskPerTradePct: RISK_PER_TRADE_PCT,
      commission: 0,
      slippage: 0,
      costs: REALISTIC_COST_SCENARIO,
      sameCandlePolicy: DEFAULT_SAME_CANDLE_POLICY,
    };

    const run = engine.run(config, candles);
    log(`[audit] ${run.trades.length} closed trades, status=${run.status}`);

    const rows = run.trades.map((trade) => auditTrade(strategyId, trade, bugsFound));
    allRowsByStrategy[strategyId] = rows;
  }

  // --- write raw CSV (one row per trade, all strategies) ---
  const allRows = Object.values(allRowsByStrategy).flat();
  const csvHeader = Object.keys(allRows[0] ?? {}).join(",");
  const csvLines = allRows.map((row) =>
    Object.values(row)
      .map((v) => (typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : (v ?? "")))
      .join(","),
  );
  writeFileSync(join(OUTPUT_DIR, "trades.csv"), [csvHeader, ...csvLines].join("\n"));

  // --- write aggregate stats per strategy + combined ---
  const summaryByStrategy: Record<string, ReturnType<typeof summarize>> = {};
  for (const [strategyId, rows] of Object.entries(allRowsByStrategy)) {
    summaryByStrategy[strategyId] = summarize(rows);
    log(`\n--- ${strategyId} cost summary ---`);
    log(JSON.stringify(summaryByStrategy[strategyId], null, 2));
  }

  if (bugsFound.length > 0) {
    log(`\n!!! ${bugsFound.length} INVARIANT VIOLATION(S) FOUND — see bugsFound.json !!!`);
    for (const bug of bugsFound.slice(0, 20)) log(`  [${bug.strategyId}] ${bug.check}: ${bug.detail}`);
  } else {
    log(`\nNo invariant violations found across ${allRows.length} trades.`);
  }

  writeFileSync(
    join(OUTPUT_DIR, "summary.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), summaryByStrategy, bugsFound }, null, 2),
  );

  log(`\n=== Cost audit complete. Results in ${OUTPUT_DIR} ===`);
}

main().catch((error) => {
  console.error("[audit] Unhandled error:", error);
  process.exitCode = 1;
});
