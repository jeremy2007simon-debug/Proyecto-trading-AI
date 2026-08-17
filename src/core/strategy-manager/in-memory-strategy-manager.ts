import { buildWaitSignal } from "@/core/strategy-manager/signal-helpers";
import type {
  Strategy,
  StrategyEvaluationInput,
  StrategyManager,
  StrategyParameters,
  StrategyRegistration,
  StrategySignal,
} from "@/core/strategy-manager/types";
import type { Market, Timeframe } from "@/core/shared/types";

/**
 * In-process, stateless-between-calls `StrategyManager`. Registration
 * state (enabled flag, live parameters, weight) lives only in this
 * instance's memory — persistence of the resulting *signals* (not the
 * registration state itself) is the caller's job, via the `strategy_signals`
 * repository.
 */
export function createInMemoryStrategyManager(): StrategyManager {
  const registrations = new Map<string, StrategyRegistration>();

  return {
    register(strategy: Strategy, options?: { weight?: number }): void {
      registrations.set(strategy.id, {
        strategy,
        enabled: strategy.enabled,
        parameters: { ...strategy.defaultParameters },
        weight: options?.weight ?? 1,
      });
    },

    setEnabled(strategyId: string, enabled: boolean): void {
      const registration = registrations.get(strategyId);
      if (registration) registration.enabled = enabled;
    },

    setParameters(strategyId: string, parameters: StrategyParameters): void {
      const registration = registrations.get(strategyId);
      if (registration) registration.parameters = { ...registration.parameters, ...parameters };
    },

    setWeight(strategyId: string, weight: number): void {
      const registration = registrations.get(strategyId);
      if (registration) registration.weight = weight;
    },

    getRegistration(strategyId: string): StrategyRegistration | undefined {
      return registrations.get(strategyId);
    },

    listRegistrations(market?: Market): StrategyRegistration[] {
      const all = [...registrations.values()];
      return market ? all.filter((r) => r.strategy.supportedMarkets.includes(market)) : all;
    },

    listEnabled(market: Market, timeframe: Timeframe): StrategyRegistration[] {
      return [...registrations.values()].filter(
        (r) =>
          r.enabled &&
          r.strategy.supportedMarkets.includes(market) &&
          r.strategy.supportedTimeframes.includes(timeframe),
      );
    },

    generateSignals(input: StrategyEvaluationInput): StrategySignal[] {
      const eligible = [...registrations.values()].filter(
        (r) =>
          r.enabled &&
          r.strategy.supportedMarkets.includes(input.market) &&
          r.strategy.supportedTimeframes.includes(input.timeframe),
      );

      return eligible.map((registration) => {
        const { strategy, parameters } = registration;

        if (!strategy.compatibleRegimes.includes(input.marketRegime)) {
          return buildWaitSignal({
            strategy,
            input,
            explanation: `${strategy.name} is not evaluated in ${input.marketRegime} — compatible regimes are ${strategy.compatibleRegimes.join(", ")}.`,
            rulesFailed: ["REGIME_COMPATIBILITY"],
            metadata: { evaluatedRegime: input.marketRegime },
          });
        }

        try {
          return strategy.generateSignal({ ...input, parameters });
        } catch (error) {
          return buildWaitSignal({
            strategy,
            input,
            explanation: `${strategy.name} raised an internal error during evaluation: ${error instanceof Error ? error.message : String(error)}`,
            rulesFailed: ["INTERNAL_ERROR"],
          });
        }
      });
    },
  };
}
