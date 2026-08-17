import "server-only";

import type { MarketRegime } from "@/core/market-regime/types";
import type { Market, SignalDirection, Timeframe } from "@/core/shared/types";
import type { StrategySignal, StrategySignalRecord } from "@/core/strategy-manager/types";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

interface StrategySignalRow {
  id: string;
  strategy_id: string;
  strategy_version: string;
  market: Market;
  timeframe: Timeframe;
  ts: string;
  signal: SignalDirection;
  market_regime: MarketRegime;
  price: number;
  entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  risk_reward: number | null;
  raw_score: number;
  rules_triggered: string[];
  rules_failed: string[];
  explanation: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

function toRecord(row: StrategySignalRow): StrategySignalRecord {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    // `strategy_signals` only stores `strategy_id` (the display name lives
    // on `public.strategies`, not duplicated per-row). Callers that need
    // the authoritative display name should take it from the in-memory
    // registry (`getDefaultStrategyManager().getRegistration(id)`), which
    // is already the single source of truth for strategy metadata — this
    // placeholder exists only so `StrategySignalRecord` satisfies
    // `StrategySignal`'s required `strategyName` field.
    strategyName: row.strategy_id,
    strategyVersion: row.strategy_version,
    signal: row.signal,
    timestamp: row.ts,
    market: row.market,
    timeframe: row.timeframe,
    marketRegime: row.market_regime,
    price: Number(row.price),
    entry: row.entry !== null ? Number(row.entry) : undefined,
    stopLoss: row.stop_loss !== null ? Number(row.stop_loss) : undefined,
    takeProfit: row.take_profit !== null ? Number(row.take_profit) : undefined,
    riskReward: row.risk_reward !== null ? Number(row.risk_reward) : undefined,
    rawScore: Number(row.raw_score),
    rulesTriggered: row.rules_triggered ?? [],
    rulesFailed: row.rules_failed ?? [],
    explanation: row.explanation,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function toRow(signal: StrategySignal) {
  return {
    strategy_id: signal.strategyId,
    strategy_version: signal.strategyVersion,
    market: signal.market,
    timeframe: signal.timeframe,
    ts: signal.timestamp,
    signal: signal.signal,
    market_regime: signal.marketRegime,
    price: signal.price,
    entry: signal.entry ?? null,
    stop_loss: signal.stopLoss ?? null,
    take_profit: signal.takeProfit ?? null,
    risk_reward: signal.riskReward ?? null,
    raw_score: signal.rawScore,
    rules_triggered: signal.rulesTriggered,
    rules_failed: signal.rulesFailed,
    explanation: signal.explanation,
    metadata: signal.metadata,
  };
}

/**
 * Persists strategy signals via the service-role client. `strategy_signals`
 * is append-only (see `supabase/migrations/0001_init_schema.sql`) — every
 * evaluation is inserted as a new row, WAIT included, never upserted or
 * overwritten. This is the system's audit trail for "why did strategy X
 * decide Y at time Z."
 */
export async function insertStrategySignals(
  signals: readonly StrategySignal[],
): Promise<{ inserted: number }> {
  if (signals.length === 0) return { inserted: 0 };

  const supabase = createSupabaseServiceRoleClient();
  const { error, count } = await supabase
    .from("strategy_signals")
    .insert(signals.map(toRow), { count: "exact" });

  if (error) throw new Error(`Failed to insert strategy signals: ${error.message}`);
  return { inserted: count ?? signals.length };
}

/** Reads a strategy's recent signal history via the RLS-scoped server client, most recent first. */
export async function getStrategySignalHistory(
  strategyId: string,
  market: Market,
  timeframe: Timeframe,
  limit = 50,
): Promise<StrategySignalRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("strategy_signals")
    .select("*")
    .eq("strategy_id", strategyId)
    .eq("market", market)
    .eq("timeframe", timeframe)
    .order("ts", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to read strategy signal history: ${error.message}`);
  return ((data ?? []) as StrategySignalRow[]).map(toRecord);
}
