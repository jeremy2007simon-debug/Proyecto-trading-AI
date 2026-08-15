-- =====================================================================
-- 0001_init_schema.sql
--
-- Initial schema for the private trading analysis platform.
-- Mirrors the TypeScript domain types in src/core/**/types.ts 1:1 via
-- Postgres enums, so the database can never accept a value the
-- application layer doesn't know about.
--
-- Scope: analysis / paper trading only. Nothing in this schema executes
-- real orders or stores broker credentials.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUM TYPES (mirror src/core/shared/types.ts and src/core/market-regime)
-- ---------------------------------------------------------------------
create type market_enum as enum ('SP500', 'NASDAQ100', 'FOREX_EURUSD', 'GOLD', 'BITCOIN');
create type timeframe_enum as enum ('1m', '5m', '15m', '30m', '1h', '4h', '1d');
create type signal_direction_enum as enum ('BUY', 'SELL', 'WAIT');
create type market_regime_enum as enum (
  'STRONG_UPTREND', 'UPTREND', 'STRONG_DOWNTREND', 'DOWNTREND',
  'RANGE', 'BREAKOUT', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'UNKNOWN'
);
create type backtest_status_enum as enum ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');
create type trade_status_enum as enum ('OPEN', 'CLOSED', 'CANCELLED');
create type exit_reason_enum as enum ('TAKE_PROFIT', 'STOP_LOSS', 'MANUAL_CLOSE', 'TIME_EXIT');
create type final_signal_status_enum as enum (
  'PENDING', 'APPROVED', 'REJECTED', 'EXECUTED_PAPER', 'EXPIRED'
);
create type risk_event_type_enum as enum (
  'SIGNAL_APPROVED', 'SIGNAL_REJECTED', 'DAILY_LOSS_LIMIT_HIT', 'TRADE_LIMIT_HIT',
  'KILL_SWITCH_ACTIVATED', 'KILL_SWITCH_DEACTIVATED', 'MISSING_STOP_LOSS',
  'MARTINGALE_BLOCKED', 'AVERAGING_DOWN_BLOCKED'
);
create type log_level_enum as enum ('DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL');

-- Shared trigger for tables that track updated_at. Append-only /
-- audit tables (candles, signals, trades, risk events, system logs)
-- intentionally do NOT get this trigger: they are immutable by design.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- users — thin profile table over Supabase Auth's auth.users
-- ---------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,
  role text not null default 'admin' check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- markets — metadata + activation flag. Only SP500 is active at launch;
-- the other four exist so the system can be extended without a schema
-- migration when a new market is turned on.
-- ---------------------------------------------------------------------
create table public.markets (
  code market_enum primary key,
  display_name text not null,
  asset_class text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create trigger trg_markets_updated_at
  before update on public.markets
  for each row execute function set_updated_at();

insert into public.markets (code, display_name, asset_class, is_active) values
  ('SP500', 'S&P 500', 'index', true),
  ('NASDAQ100', 'Nasdaq 100', 'index', false),
  ('FOREX_EURUSD', 'EUR/USD', 'forex', false),
  ('GOLD', 'Gold', 'commodity', false),
  ('BITCOIN', 'Bitcoin', 'crypto', false);

-- ---------------------------------------------------------------------
-- market_candles — raw OHLCV, append-only.
-- ---------------------------------------------------------------------
create table public.market_candles (
  id bigserial primary key,
  market market_enum not null references public.markets (code),
  timeframe timeframe_enum not null,
  ts timestamptz not null,
  open numeric(18, 6) not null,
  high numeric(18, 6) not null,
  low numeric(18, 6) not null,
  close numeric(18, 6) not null,
  volume numeric(20, 4) not null default 0,
  source text not null,
  created_at timestamptz not null default now(),
  unique (market, timeframe, ts)
);

create index idx_market_candles_lookup
  on public.market_candles (market, timeframe, ts desc);

-- ---------------------------------------------------------------------
-- market_regimes — every classification produced by the Market Regime
-- Detector, kept for duration / performance-by-regime analysis.
-- ---------------------------------------------------------------------
create table public.market_regimes (
  id uuid primary key default gen_random_uuid(),
  market market_enum not null references public.markets (code),
  timeframe timeframe_enum not null,
  detected_at timestamptz not null,
  regime market_regime_enum not null,
  previous_regime market_regime_enum,
  confidence_score numeric(5, 2) not null check (confidence_score between 0 and 100),
  rules_evaluated jsonb not null default '[]'::jsonb,
  indicators_snapshot jsonb not null default '{}'::jsonb,
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index idx_market_regimes_lookup
  on public.market_regimes (market, timeframe, detected_at desc);

create trigger trg_market_regimes_updated_at
  before update on public.market_regimes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- strategies — registry entry per Strategy Manager registration.
-- ---------------------------------------------------------------------
create table public.strategies (
  id text primary key,
  name text not null,
  description text not null,
  market market_enum not null references public.markets (code),
  timeframe timeframe_enum not null,
  compatible_regimes market_regime_enum[] not null default '{}',
  default_parameters jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  weight numeric(6, 4) not null default 1.0 check (weight >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create trigger trg_strategies_updated_at
  before update on public.strategies
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- strategy_parameters — versioned parameter history. Only one row per
-- strategy may be active at a time, enforced by the partial unique
-- index below, so parameter changes stay fully auditable.
-- ---------------------------------------------------------------------
create table public.strategy_parameters (
  id uuid primary key default gen_random_uuid(),
  strategy_id text not null references public.strategies (id) on delete cascade,
  parameters jsonb not null,
  is_active boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

create unique index uq_strategy_parameters_active_one
  on public.strategy_parameters (strategy_id)
  where is_active;

create index idx_strategy_parameters_strategy
  on public.strategy_parameters (strategy_id, effective_from desc);

-- ---------------------------------------------------------------------
-- strategy_signals — every signal a strategy has ever produced.
-- Append-only: this is the audit trail for "why did the system decide
-- X" and must never be edited after the fact.
-- ---------------------------------------------------------------------
create table public.strategy_signals (
  id uuid primary key default gen_random_uuid(),
  strategy_id text not null references public.strategies (id),
  market market_enum not null references public.markets (code),
  timeframe timeframe_enum not null,
  ts timestamptz not null,
  signal signal_direction_enum not null,
  market_regime market_regime_enum not null,
  price numeric(18, 6) not null,
  entry numeric(18, 6),
  stop_loss numeric(18, 6),
  take_profit numeric(18, 6),
  risk_reward numeric(8, 4),
  raw_score numeric(10, 4) not null,
  rules_triggered text[] not null default '{}',
  rules_failed text[] not null default '{}',
  explanation text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_strategy_signals_strategy_ts
  on public.strategy_signals (strategy_id, ts desc);

create index idx_strategy_signals_market_ts
  on public.strategy_signals (market, timeframe, ts desc);

-- ---------------------------------------------------------------------
-- strategy_performance — periodic aggregates used for performance-based
-- weighting. Never derived from a single trade; `sample_size` and
-- `sample_quality_sufficient` exist specifically to stop small-sample
-- and recency-biased weighting.
-- ---------------------------------------------------------------------
create table public.strategy_performance (
  id uuid primary key default gen_random_uuid(),
  strategy_id text not null references public.strategies (id) on delete cascade,
  market market_enum not null references public.markets (code),
  timeframe timeframe_enum not null,
  sample_size integer not null check (sample_size >= 0),
  win_rate numeric(6, 4) not null,
  profit_factor numeric(10, 4),
  expectancy numeric(10, 4),
  average_r numeric(8, 4),
  max_drawdown_pct numeric(6, 4),
  sharpe_ratio numeric(8, 4),
  sample_quality_sufficient boolean not null default false,
  period_start timestamptz not null,
  period_end timestamptz not null,
  computed_at timestamptz not null default now(),
  unique (strategy_id, market, timeframe, period_start, period_end)
);

create index idx_strategy_performance_lookup
  on public.strategy_performance (strategy_id, market, timeframe, period_end desc);

-- ---------------------------------------------------------------------
-- consensus_signals — output of the Consensus Engine. Snapshots the
-- contributing strategy signals + weights used as jsonb so this record
-- stays a faithful audit trail even if a strategy's weight changes later.
-- ---------------------------------------------------------------------
create table public.consensus_signals (
  id uuid primary key default gen_random_uuid(),
  market market_enum not null references public.markets (code),
  timeframe timeframe_enum not null,
  ts timestamptz not null,
  market_regime market_regime_enum not null,
  consensus_score numeric(8, 4) not null,
  buy_weight numeric(6, 4) not null check (buy_weight between 0 and 1),
  sell_weight numeric(6, 4) not null check (sell_weight between 0 and 1),
  wait_weight numeric(6, 4) not null check (wait_weight between 0 and 1),
  conflict_score numeric(6, 4) not null check (conflict_score between 0 and 1),
  direction signal_direction_enum not null,
  contributing_signals jsonb not null default '[]'::jsonb,
  participating_strategy_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_consensus_signals_lookup
  on public.consensus_signals (market, timeframe, ts desc);

-- ---------------------------------------------------------------------
-- final_signals — the ONLY table the Risk Engine writes to when it
-- approves or rejects a consensus candidate. This is the single choke
-- point between "the system wants to trade" and "the system may show
-- BUY/SELL to the user" — Consensus alone can never reach this table.
-- ---------------------------------------------------------------------
create table public.final_signals (
  id uuid primary key default gen_random_uuid(),
  consensus_signal_id uuid not null references public.consensus_signals (id),
  market market_enum not null references public.markets (code),
  timeframe timeframe_enum not null,
  ts timestamptz not null,
  direction signal_direction_enum not null,
  risk_approved boolean not null,
  risk_rejection_reason text,
  position_size numeric(18, 6),
  entry numeric(18, 6),
  stop_loss numeric(18, 6),
  take_profit numeric(18, 6),
  risk_reward numeric(8, 4),
  risk_amount numeric(18, 6),
  ai_explanation text,
  status final_signal_status_enum not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index idx_final_signals_lookup
  on public.final_signals (market, timeframe, ts desc);

create trigger trg_final_signals_updated_at
  before update on public.final_signals
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- paper_trades — simulated execution of an approved final signal.
-- Never touches real money or a real broker.
-- ---------------------------------------------------------------------
create table public.paper_trades (
  id uuid primary key default gen_random_uuid(),
  final_signal_id uuid not null references public.final_signals (id),
  market market_enum not null references public.markets (code),
  timeframe timeframe_enum not null,
  direction signal_direction_enum not null check (direction in ('BUY', 'SELL')),
  entry_price numeric(18, 6) not null,
  stop_loss numeric(18, 6) not null,
  take_profit numeric(18, 6),
  position_size numeric(18, 6) not null,
  commission numeric(18, 6) not null default 0,
  slippage numeric(18, 6) not null default 0,
  opened_at timestamptz not null,
  closed_at timestamptz,
  exit_price numeric(18, 6),
  exit_reason exit_reason_enum,
  pnl_amount numeric(18, 6),
  pnl_r numeric(8, 4),
  status trade_status_enum not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index idx_paper_trades_market_status
  on public.paper_trades (market, status, opened_at desc);

create trigger trg_paper_trades_updated_at
  before update on public.paper_trades
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- backtest_runs / backtest_trades — Backtesting Engine configuration
-- and results. A run is immutable once completed; re-running with
-- different parameters creates a new run row, never overwrites one.
-- ---------------------------------------------------------------------
create table public.backtest_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  market market_enum not null references public.markets (code),
  timeframe timeframe_enum not null,
  strategy_ids text[] not null,
  regime_filter market_regime_enum[],
  date_from timestamptz not null,
  date_to timestamptz not null,
  initial_capital numeric(18, 6) not null,
  risk_per_trade_pct numeric(6, 4) not null,
  commission numeric(10, 6) not null default 0,
  slippage numeric(10, 6) not null default 0,
  parameters_snapshot jsonb not null default '{}'::jsonb,
  status backtest_status_enum not null default 'QUEUED',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

create index idx_backtest_runs_status
  on public.backtest_runs (status, created_at desc);

create table public.backtest_trades (
  id uuid primary key default gen_random_uuid(),
  backtest_run_id uuid not null references public.backtest_runs (id) on delete cascade,
  strategy_id text references public.strategies (id),
  market market_enum not null references public.markets (code),
  timeframe timeframe_enum not null,
  direction signal_direction_enum not null check (direction in ('BUY', 'SELL')),
  entry_price numeric(18, 6) not null,
  stop_loss numeric(18, 6) not null,
  take_profit numeric(18, 6),
  exit_price numeric(18, 6),
  entry_at timestamptz not null,
  exit_at timestamptz,
  exit_reason exit_reason_enum,
  pnl_amount numeric(18, 6),
  pnl_r numeric(8, 4),
  market_regime_at_entry market_regime_enum,
  created_at timestamptz not null default now()
);

create index idx_backtest_trades_run
  on public.backtest_trades (backtest_run_id, entry_at);

-- ---------------------------------------------------------------------
-- performance_metrics — computed aggregates for a backtest run, a
-- strategy, or the whole paper-trading portfolio. Nullable FKs instead
-- of a polymorphic id column, so referential integrity stays real.
-- ---------------------------------------------------------------------
create table public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('BACKTEST', 'PAPER', 'STRATEGY', 'PORTFOLIO')),
  backtest_run_id uuid references public.backtest_runs (id) on delete cascade,
  strategy_id text references public.strategies (id) on delete cascade,
  market market_enum references public.markets (code),
  timeframe timeframe_enum,
  period_start timestamptz not null,
  period_end timestamptz not null,
  total_trades integer not null default 0,
  winning_trades integer not null default 0,
  losing_trades integer not null default 0,
  win_rate numeric(6, 4),
  average_win numeric(18, 6),
  average_loss numeric(18, 6),
  profit_factor numeric(10, 4),
  expectancy numeric(10, 4),
  average_r numeric(8, 4),
  max_drawdown_pct numeric(6, 4),
  max_drawdown_amount numeric(18, 6),
  sharpe_ratio numeric(8, 4),
  sortino_ratio numeric(8, 4),
  consecutive_wins integer,
  consecutive_losses integer,
  net_pnl numeric(18, 6),
  gross_profit numeric(18, 6),
  gross_loss numeric(18, 6),
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_performance_metrics_scope
  on public.performance_metrics (scope, period_end desc);

-- ---------------------------------------------------------------------
-- risk_events — append-only audit trail for every decision the Risk
-- Engine makes, including kill switch activation/deactivation.
-- ---------------------------------------------------------------------
create table public.risk_events (
  id uuid primary key default gen_random_uuid(),
  event_type risk_event_type_enum not null,
  severity text not null default 'INFO' check (severity in ('INFO', 'WARNING', 'CRITICAL')),
  market market_enum references public.markets (code),
  consensus_signal_id uuid references public.consensus_signals (id),
  final_signal_id uuid references public.final_signals (id),
  strategy_id text references public.strategies (id),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_risk_events_occurred
  on public.risk_events (occurred_at desc);

create index idx_risk_events_type
  on public.risk_events (event_type, occurred_at desc);

-- ---------------------------------------------------------------------
-- system_logs — append-only structured application log.
-- ---------------------------------------------------------------------
create table public.system_logs (
  id bigserial primary key,
  level log_level_enum not null,
  module text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index idx_system_logs_occurred
  on public.system_logs (occurred_at desc);

create index idx_system_logs_module
  on public.system_logs (module, occurred_at desc);

-- =====================================================================
-- Row Level Security
--
-- Single-user today, multi-user ready tomorrow: every table is readable
-- by any authenticated Supabase user, and writable only through the
-- service_role key (which bypasses RLS by design and is only ever used
-- server-side — see src/lib/supabase/server.ts). This means adding real
-- per-user scoping later is a policy change, not a schema migration.
-- =====================================================================
alter table public.users enable row level security;
alter table public.markets enable row level security;
alter table public.market_candles enable row level security;
alter table public.market_regimes enable row level security;
alter table public.strategies enable row level security;
alter table public.strategy_parameters enable row level security;
alter table public.strategy_signals enable row level security;
alter table public.strategy_performance enable row level security;
alter table public.consensus_signals enable row level security;
alter table public.final_signals enable row level security;
alter table public.paper_trades enable row level security;
alter table public.backtest_runs enable row level security;
alter table public.backtest_trades enable row level security;
alter table public.performance_metrics enable row level security;
alter table public.risk_events enable row level security;
alter table public.system_logs enable row level security;

create policy "self_read" on public.users
  for select to authenticated using (auth.uid() = id);

create policy "authenticated_read" on public.markets
  for select to authenticated using (true);
create policy "authenticated_read" on public.market_candles
  for select to authenticated using (true);
create policy "authenticated_read" on public.market_regimes
  for select to authenticated using (true);
create policy "authenticated_read" on public.strategies
  for select to authenticated using (true);
create policy "authenticated_read" on public.strategy_parameters
  for select to authenticated using (true);
create policy "authenticated_read" on public.strategy_signals
  for select to authenticated using (true);
create policy "authenticated_read" on public.strategy_performance
  for select to authenticated using (true);
create policy "authenticated_read" on public.consensus_signals
  for select to authenticated using (true);
create policy "authenticated_read" on public.final_signals
  for select to authenticated using (true);
create policy "authenticated_read" on public.paper_trades
  for select to authenticated using (true);
create policy "authenticated_read" on public.backtest_runs
  for select to authenticated using (true);
create policy "authenticated_read" on public.backtest_trades
  for select to authenticated using (true);
create policy "authenticated_read" on public.performance_metrics
  for select to authenticated using (true);
create policy "authenticated_read" on public.risk_events
  for select to authenticated using (true);
create policy "authenticated_read" on public.system_logs
  for select to authenticated using (true);
