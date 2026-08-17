-- =====================================================================
-- 0003_strategy_versioning.sql
--
-- Context: the Strategy Manager now tags every `Strategy` with a
-- `version` (bumped whenever the BUY/SELL/WAIT rule set changes, not
-- just a default parameter tweak) and every `StrategySignal` with the
-- `strategyVersion` that produced it — so a historical signal always
-- identifies exactly which rules generated it, even after the strategy
-- itself is later revised.
--
-- Decisions recorded here for future readers:
--  * `Strategy.supportedMarkets` / `Strategy.supportedTimeframes` (the
--    CAPABILITY a strategy declares in code) are intentionally NOT
--    persisted as arrays here. `public.strategies.market` /
--    `.timeframe` continue to record the single ACTIVE
--    market/timeframe a registration is running against today (e.g.
--    SP500/15m, or SP500/5m for Opening Range Breakout) — same
--    code-for-capability / DB-for-active-registration split already
--    used for instrument mapping in migration 0002.
--  * `compatible_regimes` / `default_parameters` already exist (0001)
--    and already map 1:1 to `Strategy.compatibleRegimes` /
--    `Strategy.defaultParameters` — no change needed.
--
-- Safety note: this migration assumes public.strategies and
-- public.strategy_signals are currently empty (no StrategyManager
-- implementation has ever run/persisted before this delivery). If a
-- target environment already has rows, backfill `strategy_version` on
-- public.strategy_signals BEFORE running the `set not null` step below.
-- =====================================================================

-- 1. public.strategy_signals: add `strategy_version`, defensively
--    (nullable first, then tightened), mirroring StrategySignal.strategyVersion.
alter table public.strategy_signals add column strategy_version text;
update public.strategy_signals set strategy_version = 'unknown' where strategy_version is null; -- no-op on an empty table
alter table public.strategy_signals alter column strategy_version set not null;

-- 2. public.strategies: add `version`, mirroring Strategy.version.
--    Defaulted (not just nullable) since every strategy registered by
--    this delivery starts at '1.0.0' — see each strategy's own
--    `version` field in src/core/strategy-manager/strategies/*.strategy.ts.
alter table public.strategies add column version text not null default '1.0.0';

-- 3. RLS: no changes needed. Row Level Security is enabled at the table
-- level (0001); new columns inherit the existing "authenticated_read"
-- policy automatically. Writes remain service-role-only, unchanged.
