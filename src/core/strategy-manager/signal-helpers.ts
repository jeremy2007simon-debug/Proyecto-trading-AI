import type {
  Strategy,
  StrategyEvaluationInput,
  StrategySignal,
} from "@/core/strategy-manager/types";

/**
 * Builds a WAIT `StrategySignal`. WAIT is a fully normal, frequent
 * response — not an error case — so this is the one place every "no
 * trade" reason (regime incompatibility, insufficient data, no setup,
 * risk:reward below minimum, an unexpected internal error) constructs
 * its signal, keeping the shape (and the "never fabricate entry/stop/TP
 * on a non-actionable signal" rule) consistent everywhere it's used:
 * both by `StrategyManager` itself (regime/error synthesis) and by each
 * strategy internally.
 */
export function buildWaitSignal(params: {
  strategy: Pick<Strategy, "id" | "name" | "version">;
  input: StrategyEvaluationInput;
  explanation: string;
  rulesFailed: string[];
  rulesTriggered?: string[];
  rawScore?: number;
  metadata?: Record<string, unknown>;
}): StrategySignal {
  const lastCandle = params.input.candles[params.input.candles.length - 1];

  return {
    strategyId: params.strategy.id,
    strategyName: params.strategy.name,
    strategyVersion: params.strategy.version,
    signal: "WAIT",
    timestamp: lastCandle.timestamp,
    market: params.input.market,
    timeframe: params.input.timeframe,
    marketRegime: params.input.marketRegime,
    price: lastCandle.close,
    entry: undefined,
    stopLoss: undefined,
    takeProfit: undefined,
    riskReward: undefined,
    rawScore: params.rawScore ?? 0,
    rulesTriggered: params.rulesTriggered ?? [],
    rulesFailed: params.rulesFailed,
    explanation: params.explanation,
    metadata: params.metadata ?? {},
  };
}
