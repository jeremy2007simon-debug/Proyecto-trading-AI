import type { FinalSignal } from "@/core/signal-engine/types";
import type { MarketRegime } from "@/core/market-regime/types";
import type { StrategyPerformanceSummary } from "@/core/strategy-manager/types";

/**
 * Explicit capability boundary for the AI layer. The quantitative
 * pipeline (Market Regime -> Strategy Manager -> Consensus -> Risk)
 * always has priority; the AI layer is read-only with respect to
 * trading decisions. Every method below only ever produces text, never
 * a number that feeds back into risk, sizing, or signal direction.
 *
 * The AI layer explicitly MAY:
 *   - explain why a FinalSignal was produced, in plain language, from
 *     the real data already computed by the pipeline
 *   - summarize the current market regime
 *   - compare historical results
 *   - flag anomalies or performance deterioration
 *   - summarize conflicts between strategies
 *
 * The AI layer explicitly MAY NOT (enforced outside this interface —
 * no implementation of it is ever given write access to Risk Engine,
 * Strategy Manager, or execution):
 *   - bypass the Risk Engine
 *   - modify a stop loss or take profit
 *   - increase risk or position size
 *   - execute trades
 *   - change strategy rules or weights
 *   - invent a signal that the quantitative pipeline did not produce
 */
export interface AiExplanationLayer {
  readonly id: string;

  explainFinalSignal(signal: FinalSignal): Promise<string>;
  summarizeMarketRegime(regime: MarketRegime, context: string): Promise<string>;
  compareStrategyPerformance(
    summaries: StrategyPerformanceSummary[],
  ): Promise<string>;
  detectAnomalies(context: string): Promise<string[]>;
  summarizeConflict(finalSignal: FinalSignal): Promise<string>;
}
