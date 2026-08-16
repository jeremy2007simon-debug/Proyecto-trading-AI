import "server-only";

import type { Market, Timeframe } from "@/core/shared/types";
import type { StrategySignal } from "@/core/strategy-manager/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Lightweight observability for a single `generateSignals` call: logs a
 * one-line summary (counts per signal direction) to `system_logs`
 * (module = 'strategy-manager'), same pattern as `data-quality-log.ts`.
 * The full per-strategy detail (including WAIT reasons) is already
 * captured by `insertStrategySignals` persisting every individual
 * `StrategySignal` row — this is a coarser, quick-to-scan companion.
 */
export async function logStrategyEvaluationSummary(
  signals: readonly StrategySignal[],
  market: Market,
  timeframe: Timeframe,
): Promise<void> {
  const buyCount = signals.filter((s) => s.signal === "BUY").length;
  const sellCount = signals.filter((s) => s.signal === "SELL").length;
  const waitCount = signals.filter((s) => s.signal === "WAIT").length;

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("system_logs").insert({
    level: "INFO",
    module: "strategy-manager",
    message: `Evaluated ${signals.length} strategies for ${market}/${timeframe}: ${buyCount} BUY, ${sellCount} SELL, ${waitCount} WAIT.`,
    context: {
      market,
      timeframe,
      signals: signals.map((s) => ({
        strategyId: s.strategyId,
        strategyVersion: s.strategyVersion,
        signal: s.signal,
        rulesFailed: s.rulesFailed,
      })),
    },
    occurred_at: new Date().toISOString(),
  });

  if (error) throw new Error(`Failed to log strategy evaluation summary: ${error.message}`);
}
