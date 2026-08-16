import "server-only";

import type { WalkForwardConfig } from "@/core/backtesting/types";
import type { Market, Timeframe } from "@/core/shared/types";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface WalkForwardRunRecord {
  id: string;
  name: string;
  strategyId: string;
  market: Market;
  timeframe: Timeframe;
  config: WalkForwardConfig;
  createdAt: string;
}

interface WalkForwardRunRow {
  id: string;
  name: string;
  strategy_id: string;
  market: Market;
  timeframe: Timeframe;
  config: Record<string, unknown>;
  created_at: string;
}

function toRecord(row: WalkForwardRunRow): WalkForwardRunRecord {
  return {
    id: row.id,
    name: row.name,
    strategyId: row.strategy_id,
    market: row.market,
    timeframe: row.timeframe,
    config: row.config as unknown as WalkForwardConfig,
    createdAt: row.created_at,
  };
}

/** Creates the parent `walk_forward_runs` row; each window's train/validation/forward phases are then persisted as ordinary `backtest_runs` rows tagged with the returned id (see `backtest-runs.repository.ts` / migration 0004's header comment). */
export async function insertWalkForwardRun(params: {
  name: string;
  strategyId: string;
  market: Market;
  timeframe: Timeframe;
  config: WalkForwardConfig;
}): Promise<string> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("walk_forward_runs")
    .insert({
      name: params.name,
      strategy_id: params.strategyId,
      market: params.market,
      timeframe: params.timeframe,
      config: params.config as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to insert walk-forward run: ${error.message}`);
  return (data as { id: string }).id;
}

export async function getWalkForwardRun(id: string): Promise<WalkForwardRunRecord | undefined> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("walk_forward_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to read walk-forward run: ${error.message}`);
  return data ? toRecord(data as WalkForwardRunRow) : undefined;
}
