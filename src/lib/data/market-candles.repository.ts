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

export interface GetCandlesInRangeParams {
  market: Market;
  timeframe: Timeframe;
  /** Inclusive. */
  from: string;
  /** Inclusive. */
  to: string;
}

const RANGE_PAGE_SIZE = 1000;

/**
 * Reads an arbitrary historical date range via the RLS-scoped server
 * client, in chronological order — unlike `getRecentCandles` (only
 * "latest N"), this is what the backtesting engine needs to pull a
 * multi-month/year window. Paginates internally (`PostgREST`'s default
 * row cap is well below what a real backtest dataset needs) so callers
 * never have to think about page size.
 */
export async function getCandlesInRange({
  market,
  timeframe,
  from,
  to,
}: GetCandlesInRangeParams): Promise<Candle[]> {
  const supabase = await createSupabaseServerClient();
  const candles: Candle[] = [];
  let page = 0;

  for (;;) {
    const start = page * RANGE_PAGE_SIZE;
    const end = start + RANGE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("market_candles")
      .select("market,timeframe,ts,open,high,low,close,volume,symbol,provider")
      .eq("market", market)
      .eq("timeframe", timeframe)
      .gte("ts", from)
      .lte("ts", to)
      .order("ts", { ascending: true })
      .range(start, end);

    if (error) throw new Error(`Failed to read market candles in range: ${error.message}`);

    const rows = (data ?? []) as MarketCandleRow[];
    candles.push(...rows.map(toCandle));
    if (rows.length < RANGE_PAGE_SIZE) break;
    page += 1;
  }

  return candles;
}
