-- =====================================================================
-- 0004_backtesting_extensions.sql
--
-- Context: this delivery gives `src/core/backtesting/types.ts` and
-- `src/core/risk-engine/types.ts` their first concrete implementations
-- (an event-driven single-strategy backtesting engine, walk-forward
-- testing, and Monte Carlo risk analysis). `backtest_runs`,
-- `backtest_trades`, and `performance_metrics` already exist (0001) with
-- reasonable columns — this migration extends them additively for the
-- fields the new engine actually produces, and adds two new tables
-- (`walk_forward_runs`, `monte_carlo_results`) that had no schema
-- representation at all before this block.
--
-- Decisions recorded here for future readers:
--  * `exit_reason_enum` is NOT altered to add an "AMBIGUOUS" value. Same-
--    candle ambiguity (stop AND target touched in one bar — see
--    `src/core/backtesting/same-candle-resolver.ts`) is recorded as a
--    boolean flag (`ambiguous_intrabar_exit`) ALONGSIDE the real,
--    resolved `exit_reason` (STOP_LOSS or TAKE_PROFIT per the configured
--    `same_candle_policy`), not as a third exit reason — the trade DID
--    exit via one of those two paths, the flag just marks that OHLC data
--    alone couldn't prove which was touched first.
--  * `commission`/`slippage` on `backtest_runs` (0001, both flat
--    numerics) are NOT removed — `cost_config` (jsonb) supersedes them
--    for the engine's actual `ExecutionCostConfig` shape
--    (`commissionPerFill`/`slippagePct`/`halfSpread`), which doesn't map
--    to two flat numbers. The old columns are kept nullable-compatible
--    (untouched) for any historical rows; new rows populate
--    `cost_config` as the source of truth.
--  * Walk-forward windows are represented by tagging each PHASE
--    (train/validation/forward) of each window as its own
--    `backtest_runs` row (`walk_forward_run_id` +
--    `walk_forward_window_index` + `walk_forward_phase`), rather than a
--    separate trades table — this reuses the existing `backtest_trades`
--    FK relationship instead of duplicating it for walk-forward.
--
-- Safety note: this migration assumes `backtest_runs`/`backtest_trades`/
-- `performance_metrics` are currently empty (no concrete
-- `BacktestingEngine` implementation existed before this delivery, so
-- nothing could have written rows). If a target environment already has
-- rows, backfill `mode`/`cost_config`/`same_candle_policy` on
-- `backtest_runs` BEFORE relying on their `not null` defaults being
-- meaningful for pre-existing data.
-- =====================================================================

-- 1. backtest_runs: engine mode, cost/policy config, dataset split,
--    reproducibility (code_version), and walk-forward linkage.
alter table public.backtest_runs
  add column mode text not null default 'SINGLE_STRATEGY'
    check (mode in ('SINGLE_STRATEGY', 'MULTI_STRATEGY', 'FULL_CONSENSUS')),
  add column cost_config jsonb not null default '{}'::jsonb,
  add column same_candle_policy text not null default 'CONSERVATIVE'
    check (same_candle_policy in ('CONSERVATIVE', 'OPTIMISTIC')),
  add column dataset_split jsonb,
  add column code_version text,
  add column walk_forward_run_id uuid,
  add column walk_forward_window_index integer,
  add column walk_forward_phase text
    check (walk_forward_phase in ('TRAIN', 'VALIDATION', 'FORWARD'));

-- 2. backtest_trades: execution cost breakdown, same-candle ambiguity
--    flag, and the audit fields point 24 requires (indicators/rules at
--    entry, strategy version).
alter table public.backtest_trades
  add column strategy_version text,
  add column commission_paid numeric(18, 6) not null default 0,
  add column slippage_paid numeric(18, 6) not null default 0,
  add column ambiguous_intrabar_exit boolean not null default false,
  add column indicators_at_entry jsonb,
  add column rules_triggered text[] not null default '{}';

-- 3. walk_forward_runs: the parent grouping for a set of walk-forward
--    windows. Each window's train/validation/forward phases are their
--    own backtest_runs rows (see decisions above), linked back here.
create table public.walk_forward_runs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  strategy_id text not null references public.strategies (id),
  market market_enum not null references public.markets (code),
  timeframe timeframe_enum not null,
  config jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.backtest_runs
  add constraint fk_backtest_runs_walk_forward
  foreign key (walk_forward_run_id) references public.walk_forward_runs (id) on delete cascade;

create index idx_backtest_runs_walk_forward
  on public.backtest_runs (walk_forward_run_id, walk_forward_window_index);

-- 4. monte_carlo_results: bootstrap-resampling risk analysis over one
--    completed backtest run's realized trade sequence (see
--    src/core/backtesting/monte-carlo.ts for the full methodology and
--    its "risk analysis, not a profitability forecast" disclaimer).
create table public.monte_carlo_results (
  id uuid primary key default gen_random_uuid(),
  backtest_run_id uuid not null references public.backtest_runs (id) on delete cascade,
  num_simulations integer not null check (num_simulations > 0),
  seed bigint not null,
  max_drawdown_pct_p5 numeric(6, 4) not null,
  max_drawdown_pct_p50 numeric(6, 4) not null,
  max_drawdown_pct_p95 numeric(6, 4) not null,
  ending_equity_p5 numeric(18, 6) not null,
  ending_equity_p50 numeric(18, 6) not null,
  ending_equity_p95 numeric(18, 6) not null,
  losing_streak_p5 integer not null,
  losing_streak_p50 integer not null,
  losing_streak_p95 integer not null,
  computed_at timestamptz not null default now()
);

create index idx_monte_carlo_results_run
  on public.monte_carlo_results (backtest_run_id);

-- 5. RLS: both new tables follow the existing convention exactly —
-- read-only for authenticated users, writes are service-role-only (no
-- insert/update/delete policy is created for `authenticated`).
alter table public.walk_forward_runs enable row level security;
alter table public.monte_carlo_results enable row level security;

create policy authenticated_read on public.walk_forward_runs
  for select to authenticated using (true);
create policy authenticated_read on public.monte_carlo_results
  for select to authenticated using (true);
