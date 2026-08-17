import { z } from "zod";
import {
  DEFAULT_SAME_CANDLE_POLICY,
  REALISTIC_COST_SCENARIO,
  ZERO_COST_BASELINE,
  type BacktestConfig,
} from "@/core/backtesting/types";

/**
 * Request body for `POST /api/backtesting/run`. Deliberately restricted
 * to `mode: "SINGLE_STRATEGY"` (the only implemented engine mode) —
 * `strategyId` is a single string, not `strategyIds`, so the API surface
 * can't even express multi-strategy/consensus mode yet.
 */
export const backtestRunRequestSchema = z.object({
  strategyId: z.string().min(1),
  market: z.enum(["SP500", "NASDAQ100", "FOREX_EURUSD", "GOLD", "BITCOIN"]).default("SP500"),
  timeframe: z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]),
  dateFrom: z.string().min(1),
  dateTo: z.string().min(1),
  initialCapital: z.coerce.number().positive().default(10_000),
  riskPerTradePct: z.coerce.number().positive().max(100).default(0.5),
  costPreset: z.enum(["ZERO", "REALISTIC", "CUSTOM"]).default("REALISTIC"),
  commissionPerFill: z.coerce.number().min(0).optional(),
  slippagePct: z.coerce.number().min(0).optional(),
  halfSpread: z.coerce.number().min(0).optional(),
  sameCandlePolicy: z.enum(["CONSERVATIVE", "OPTIMISTIC"]).default(DEFAULT_SAME_CANDLE_POLICY),
});

export type BacktestRunRequest = z.infer<typeof backtestRunRequestSchema>;

/** Maps the validated request body into the core `BacktestConfig` the engine actually consumes. */
export function toBacktestConfig(request: BacktestRunRequest): BacktestConfig {
  const costs =
    request.costPreset === "ZERO"
      ? ZERO_COST_BASELINE
      : request.costPreset === "REALISTIC"
        ? REALISTIC_COST_SCENARIO
        : {
            commissionPerFill: request.commissionPerFill ?? REALISTIC_COST_SCENARIO.commissionPerFill,
            slippagePct: request.slippagePct ?? REALISTIC_COST_SCENARIO.slippagePct,
            halfSpread: request.halfSpread ?? REALISTIC_COST_SCENARIO.halfSpread,
          };

  return {
    name: `${request.strategyId} ${request.market} ${request.timeframe} ${request.dateFrom}..${request.dateTo}`,
    market: request.market,
    timeframe: request.timeframe,
    mode: "SINGLE_STRATEGY",
    strategyIds: [request.strategyId],
    dateFrom: request.dateFrom,
    dateTo: request.dateTo,
    initialCapital: request.initialCapital,
    riskPerTradePct: request.riskPerTradePct,
    commission: 0,
    slippage: 0,
    costs,
    sameCandlePolicy: request.sameCandlePolicy,
  };
}
