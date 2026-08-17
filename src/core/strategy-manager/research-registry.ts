import { createInMemoryStrategyManager } from "@/core/strategy-manager/in-memory-strategy-manager";
import { breakoutStrategy } from "@/core/strategy-manager/strategies/breakout.strategy";
import { meanReversionStrategy } from "@/core/strategy-manager/strategies/mean-reversion.strategy";
import { openingRangeBreakoutStrategy } from "@/core/strategy-manager/strategies/opening-range-breakout.strategy";
import { trendFollowingStrategy } from "@/core/strategy-manager/strategies/trend-following.strategy";
import { vwapStrategy } from "@/core/strategy-manager/strategies/vwap.strategy";
import { gapContinuationStrategy } from "@/core/strategy-manager/strategies/research/gap-continuation.strategy";
import { momentumTrendStrategy } from "@/core/strategy-manager/strategies/research/momentum-trend.strategy";
import { pairsSpreadReversionStrategy } from "@/core/strategy-manager/strategies/research/pairs-spread-reversion.strategy";
import { sessionMomentumStrategy } from "@/core/strategy-manager/strategies/research/session-momentum.strategy";
import { trendPullbackStrategy } from "@/core/strategy-manager/strategies/research/trend-pullback.strategy";
import { volatilityCompressionBreakoutStrategy } from "@/core/strategy-manager/strategies/research/volatility-compression-breakout.strategy";
import { volatilityRegimeMomentumStrategy } from "@/core/strategy-manager/strategies/research/volatility-regime-momentum.strategy";
import type { StrategyManager } from "@/core/strategy-manager/types";

let researchManager: StrategyManager | undefined;

/**
 * Block 5 — Strategy Discovery & Validation Engine registry. Deliberately
 * SEPARATE from `getDefaultStrategyManager()` (`registry.ts`): this
 * manager exists only for research scripts to run backtests against, and
 * is never wired into any API route, dashboard page, or the Consensus
 * Engine. Registers all 5 legacy strategies (now carrying Block 5
 * lifecycle metadata — see their own files) PLUS the new Block 5 research
 * strategies, so a single manager instance covers every experiment this
 * block runs. Production behavior (`ACTIVE_MARKETS`, the default
 * manager, the dashboard) is completely unaffected by anything in this
 * file.
 */
export function getResearchStrategyManager(): StrategyManager {
  if (!researchManager) {
    researchManager = createInMemoryStrategyManager();
    // Legacy (Block 4 / Block 4.5) — kept for audit, never deleted.
    researchManager.register(trendFollowingStrategy);
    researchManager.register(breakoutStrategy);
    researchManager.register(vwapStrategy);
    researchManager.register(meanReversionStrategy);
    researchManager.register(openingRangeBreakoutStrategy);
    // Block 5 — new research strategies.
    researchManager.register(momentumTrendStrategy);
    researchManager.register(trendPullbackStrategy);
    researchManager.register(volatilityCompressionBreakoutStrategy);
    researchManager.register(gapContinuationStrategy);
    researchManager.register(sessionMomentumStrategy);
    researchManager.register(volatilityRegimeMomentumStrategy);
    researchManager.register(pairsSpreadReversionStrategy);
  }
  return researchManager;
}
