import { z } from "zod";

/** Shared query-param schema for the market-data-family API routes. */
export const marketQuerySchema = z.object({
  market: z.enum(["SP500", "NASDAQ100", "FOREX_EURUSD", "GOLD", "BITCOIN"]).default("SP500"),
  timeframe: z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]).default("15m"),
});
