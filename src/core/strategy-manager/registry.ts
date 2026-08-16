import { createInMemoryStrategyManager } from "@/core/strategy-manager/in-memory-strategy-manager";
import { breakoutStrategy } from "@/core/strategy-manager/strategies/breakout.strategy";
import { meanReversionStrategy } from "@/core/strategy-manager/strategies/mean-reversion.strategy";
import { openingRangeBreakoutStrategy } from "@/core/strategy-manager/strategies/opening-range-breakout.strategy";
import { trendFollowingStrategy } from "@/core/strategy-manager/strategies/trend-following.strategy";
import { vwapStrategy } from "@/core/strategy-manager/strategies/vwap.strategy";
import type { StrategyManager } from "@/core/strategy-manager/types";

let defaultManager: StrategyManager | undefined;

/**
 * The single `StrategyManager` instance every orchestrator/API route
 * should use, with all 5 strategies registered exactly once. Pure — no
 * I/O, no database access; registration state lives only in process
 * memory (persisting the resulting *signals* is the caller's job).
 */
export function getDefaultStrategyManager(): StrategyManager {
  if (!defaultManager) {
    defaultManager = createInMemoryStrategyManager();
    defaultManager.register(trendFollowingStrategy);
    defaultManager.register(breakoutStrategy);
    defaultManager.register(vwapStrategy);
    defaultManager.register(meanReversionStrategy);
    defaultManager.register(openingRangeBreakoutStrategy);
  }
  return defaultManager;
}
