import { createInMemoryStrategyManager } from "@/core/strategy-manager/in-memory-strategy-manager";
import { fxMeanReversionStrategy } from "@/core/strategy-manager/strategies/forex/fx-mean-reversion.strategy";
import { fxPullbackTrendStrategy } from "@/core/strategy-manager/strategies/forex/fx-pullback-trend.strategy";
import { fxSessionBreakoutStrategy } from "@/core/strategy-manager/strategies/forex/fx-session-breakout.strategy";
import { fxTrendMomentumStrategy } from "@/core/strategy-manager/strategies/forex/fx-trend-momentum.strategy";
import { fxVolatilityBreakoutStrategy } from "@/core/strategy-manager/strategies/forex/fx-volatility-breakout.strategy";
import type { StrategyManager } from "@/core/strategy-manager/types";

let researchManager: StrategyManager | undefined;

/**
 * Block 8 — Forex Research Lab registry. Deliberately SEPARATE from both
 * `getDefaultStrategyManager()` (production, equities only) and
 * `getResearchStrategyManager()` (Block 5, equities research) — this
 * manager exists only for the Block 8 forex research scripts to run
 * backtests against. Never wired into any API route, dashboard page, the
 * Consensus Engine, or RS3M. Registers only the 5 FX strategies defined
 * in `src/core/strategy-manager/strategies/forex/`.
 */
export function getForexResearchStrategyManager(): StrategyManager {
  if (!researchManager) {
    researchManager = createInMemoryStrategyManager();
    researchManager.register(fxTrendMomentumStrategy);
    researchManager.register(fxPullbackTrendStrategy);
    researchManager.register(fxVolatilityBreakoutStrategy);
    researchManager.register(fxSessionBreakoutStrategy);
    researchManager.register(fxMeanReversionStrategy);
  }
  return researchManager;
}
