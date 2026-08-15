-- =====================================================================
-- 0002_market_candles_provider_identity.sql
--
-- Context: the Market Data Engine now tags every candle with the exact
-- ticker/instrument it was fetched as (`symbol`, e.g. "SPY") and the
-- data provider that served it (`provider`, e.g. "alpaca"), mirroring
-- Candle.symbol / Candle.provider in src/core/market-data/types.ts.
--
-- Decisions recorded here for future readers:
--  * Instrument-to-ticker mapping ("SP500 -> SPY ETF") is intentionally
--    NOT stored in public.markets. It lives in code
--    (src/core/market-data/instruments.ts) because it is a data-sourcing
--    decision tied to whichever provider/instrument type (ETF vs future
--    vs CFD) gets chosen, and can change without a schema migration.
--    public.markets stays coarse display/activation metadata only.
--  * DataQualityReport is NOT given its own table in this delivery. It
--    is logged to public.system_logs with module = 'data-quality',
--    consistent with that table's existing role as the append-only
--    diagnostic sink. Promote to a dedicated table only if/when the
--    Data Quality page needs indexed queries beyond
--    (module, occurred_at) that jsonb `context` can't serve at scale.
--  * The unique constraint on market_candles now includes `provider`:
--    the same (market, timeframe, ts) can legitimately be reported
--    slightly differently by two providers (e.g. differing volume);
--    the previous constraint would have silently collided them.
--
-- Safety note: this migration assumes public.market_candles is
-- currently empty (no ingestion pipeline has ever run as of this
-- migration). If a target environment already has rows, backfill
-- `symbol` for existing rows BEFORE running the `set not null` step.
-- =====================================================================

-- 1. Add `symbol`, defensively (nullable first, then tightened).
alter table public.market_candles add column symbol text;
update public.market_candles set symbol = '' where symbol is null; -- no-op on an empty table
alter table public.market_candles alter column symbol set not null;
alter table public.market_candles add constraint market_candles_symbol_not_blank
  check (length(trim(symbol)) > 0);

-- 2. Rename `source` -> `provider` (same column, clarified purpose) and
--    add the same non-blank guard `source` never had.
alter table public.market_candles rename column source to provider;
alter table public.market_candles add constraint market_candles_provider_not_blank
  check (length(trim(provider)) > 0);

-- 3. Reinforce the uniqueness constraint to include `provider`.
--    NOTE: verify this is the actual auto-generated constraint name in
--    your environment (`\d public.market_candles` or query
--    information_schema.table_constraints) before running in
--    production - Postgres derives it from the original inline
--    `unique (market, timeframe, ts)` clause in 0001 as
--    market_candles_market_timeframe_ts_key, but this is not
--    guaranteed across all Postgres versions/tools.
alter table public.market_candles
  drop constraint if exists market_candles_market_timeframe_ts_key;

alter table public.market_candles
  add constraint uq_market_candles_market_tf_ts_provider
  unique (market, timeframe, ts, provider);

-- idx_market_candles_lookup (market, timeframe, ts desc) from 0001 is
-- still the right index for range-scan reads regardless of provider;
-- no change needed. The new unique constraint's backing index already
-- serves provider-scoped lookups and the ingest upsert's
-- ON CONFLICT (market, timeframe, ts, provider) target.

-- 4. RLS: no changes needed. Row Level Security is enabled at the
-- table level (0001); new columns inherit the existing
-- "authenticated_read" policy automatically. Writes remain
-- service-role-only, unchanged.
