import "server-only";

import type { MonteCarloResult } from "@/core/backtesting/types";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

interface MonteCarloResultRow {
  id: string;
  backtest_run_id: string;
  num_simulations: number;
  seed: number;
  max_drawdown_pct_p5: number;
  max_drawdown_pct_p50: number;
  max_drawdown_pct_p95: number;
  ending_equity_p5: number;
  ending_equity_p50: number;
  ending_equity_p95: number;
  losing_streak_p5: number;
  losing_streak_p50: number;
  losing_streak_p95: number;
  computed_at: string;
}

function toResult(row: MonteCarloResultRow): MonteCarloResult {
  return {
    numSimulations: row.num_simulations,
    seed: Number(row.seed),
    maxDrawdownPct: {
      p5: Number(row.max_drawdown_pct_p5),
      p50: Number(row.max_drawdown_pct_p50),
      p95: Number(row.max_drawdown_pct_p95),
    },
    endingEquity: {
      p5: Number(row.ending_equity_p5),
      p50: Number(row.ending_equity_p50),
      p95: Number(row.ending_equity_p95),
    },
    losingStreak: {
      p5: row.losing_streak_p5,
      p50: row.losing_streak_p50,
      p95: row.losing_streak_p95,
    },
  };
}

export async function insertMonteCarloResult(backtestRunId: string, result: MonteCarloResult): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("monte_carlo_results").insert({
    backtest_run_id: backtestRunId,
    num_simulations: result.numSimulations,
    seed: result.seed,
    max_drawdown_pct_p5: result.maxDrawdownPct.p5,
    max_drawdown_pct_p50: result.maxDrawdownPct.p50,
    max_drawdown_pct_p95: result.maxDrawdownPct.p95,
    ending_equity_p5: result.endingEquity.p5,
    ending_equity_p50: result.endingEquity.p50,
    ending_equity_p95: result.endingEquity.p95,
    losing_streak_p5: result.losingStreak.p5,
    losing_streak_p50: result.losingStreak.p50,
    losing_streak_p95: result.losingStreak.p95,
  });
  if (error) throw new Error(`Failed to insert Monte Carlo result: ${error.message}`);
}

export async function getMonteCarloResult(backtestRunId: string): Promise<MonteCarloResult | undefined> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("monte_carlo_results")
    .select("*")
    .eq("backtest_run_id", backtestRunId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to read Monte Carlo result: ${error.message}`);
  return data ? toResult(data as MonteCarloResultRow) : undefined;
}
