import "server-only";

import type { Candle } from "@/core/market-data/types";
import type { Market, Timeframe } from "@/core/shared/types";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

interface MarketCandleRow {
  market: Market;
  timeframe: Timeframe;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
  provider: string;
}

function toCandle(row: MarketCandleRow): Candle {
  return {
    market: row.market,
    timeframe: row.timeframe,
    timestamp: row.ts,
    symbol: row.symbol,
    provider: row.provider,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  };
}

function toRow(candle: Candle): MarketCandleRow {
  return {
    market: candle.market,
    timeframe: candle.timeframe,
    ts: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    symbol: candle.symbol,
    provider: candle.provider,
  };
}

/**
 * Writes candles via the service-role client (the only client allowed
 * to write core trading tables — see `src/lib/supabase/server.ts`).
 * Upserts on the `(market, timeframe, ts, provider)` unique constraint
 * from `supabase/migrations/0002_market_candles_provider_identity.sql`,
 * so re-ingesting an overlapping range never creates duplicates.
 */
export async function upsertCandles(candles: Candle[]): Promise<{ inserted: number }> {
  if (candles.length === 0) return { inserted: 0 };

  const supabase = createSupabaseServiceRoleClient();
  const { error, count } = await supabase
    .from("market_candles")
    .upsert(candles.map(toRow), { onConflict: "market,timeframe,ts,provider", count: "exact" });

  if (error) throw new Error(`Failed to upsert market candles: ${error.message}`);
  return { inserted: count ?? candles.length };
}

export interface GetRecentCandlesParams {
  market: Market;
  timeframe: Timeframe;
  limit?: number;
}

/** Reads candles via the RLS-scoped server client, in chronological order. */
export async function getRecentCandles({
  market,
  timeframe,
  limit = 500,
}: GetRecentCandlesParams): Promise<Candle[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("market_candles")
    .select("market,timeframe,ts,open,high,low,close,volume,symbol,provider")
    .eq("market", market)
    .eq("timeframe", timeframe)
    .order("ts", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to read market candles: ${error.message}`);
  return ((data ?? []) as MarketCandleRow[]).map(toCandle).reverse();
}
