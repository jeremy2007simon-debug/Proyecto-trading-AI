-- =====================================================================
-- 0005_rs3m_forward_executions.sql
--
-- Context: Block 6's RS3M forward paper-trading Routine
-- (`scripts/block6/paper/run-rebalance.ts`) already records every
-- rebalance attempt (executed or blocked) as an append-only JSONL row in
-- `results/block6/forward/ledger.jsonl` — but that file lives on the
-- local filesystem of whatever ephemeral container the Routine's daily
-- firing happens to run in, and is NOT committed to git. An audit
-- requested from a different session/container has no way to read it.
-- This migration adds a single new table, `rs3m_forward_executions`,
-- that durably persists the same evidence (plus a few explicit derived
-- fields callers kept re-deriving by hand: signal freshness, approval
-- status, a stable execution id) in Supabase, so forward evidence
-- survives across containers/sessions.
--
-- PURELY ADDITIVE — no existing table, column, enum, or row is touched,
-- altered, or dropped. This migration is 100% "create" statements. It
-- does not change RS3M_CANDIDATE_V1, its hash, the signal calculator, any
-- safety guard, or the execution engine's decision logic in any way — it
-- only gives the scheduler script one more (best-effort, non-blocking)
-- place to write down what already happened.
--
-- Column choices, for future readers:
--  * `execution_id` is a client-generated UUID (one per `run-rebalance.ts`
--    invocation attempt), not the Postgres row id — it's the join key a
--    caller can quote back (e.g. in a notification or a report) before
--    the insert necessarily succeeds, and it's stable even if a retry
--    ever needed to upsert the same attempt.
--  * `ranking`, `positions_before/after`, `proposed_orders`,
--    `orders_submitted`, `guard_violations`, `broker_response` are all
--    `jsonb` — they mirror the existing `ForwardEvidenceRecord` shape
--    (`src/core/paper-trading/rs3m/forward-evidence.ts`) field-for-field
--    rather than inventing a new normalized schema for a table that is
--    read far more rarely than it's written, and whose shape may still
--    evolve with the (also jsonb) `system_logs.context` precedent
--    elsewhere in this schema.
--  * `signal_freshness` and `approval_status` are NOT present on
--    `ForwardEvidenceRecord` — they're short enum-like text derived by
--    the caller from `guardResult.violations`/`blockedReason` at write
--    time, added here because they're exactly the two questions a
--    non-technical audit asks most often ("is the signal fresh?", "is it
--    waiting on me?") and forcing a reader to reverse-engineer them from
--    `guard_violations` every time would be worse than a few extra bytes.
--  * No foreign key to any other table — this row stands alone by
--    design; `candidate_id`/`candidate_hash` are plain text snapshots
--    (RS3M_CANDIDATE_V1 is a frozen, version-controlled TypeScript
--    constant, not a database row).
-- =====================================================================

create table public.rs3m_forward_executions (
  id bigserial primary key,
  execution_id uuid not null unique,
  occurred_at timestamptz not null,

  candidate_id text not null,
  candidate_hash text not null,

  decision_month text,
  data_cutoff timestamptz,
  ranking jsonb not null default '[]'::jsonb,
  selected_asset text,
  signal_freshness text not null,

  account_equity_usd numeric(18, 6),
  account_equity_after_usd numeric(18, 6),
  positions_before jsonb,
  positions_after jsonb,

  target_asset text,
  proposed_orders jsonb not null default '[]'::jsonb,
  estimated_turnover_pct numeric(9, 6),
  reference_rebalance_cost_bps numeric(9, 4),

  guard_violations jsonb not null default '[]'::jsonb,
  approval_status text not null,

  orders_submitted jsonb not null default '[]'::jsonb,
  broker_response jsonb,
  any_order_still_in_flight boolean,

  final_state text not null,
  skip_reason text,
  error_message text,

  mode text not null default 'PAPER_ONLY',
  created_at timestamptz not null default now(),

  constraint rs3m_forward_executions_mode_paper_only check (mode = 'PAPER_ONLY')
);

create index idx_rs3m_forward_executions_occurred
  on public.rs3m_forward_executions (occurred_at desc);

create index idx_rs3m_forward_executions_decision_month
  on public.rs3m_forward_executions (decision_month, occurred_at desc);

create index idx_rs3m_forward_executions_final_state
  on public.rs3m_forward_executions (final_state, occurred_at desc);

-- RLS: same convention as every other table in this schema (see
-- 0001_init_schema.sql's header) — readable by any authenticated user,
-- writable only through the service_role key (bypasses RLS by design,
-- used only server-side — see src/lib/supabase/server.ts).
alter table public.rs3m_forward_executions enable row level security;

create policy authenticated_read on public.rs3m_forward_executions
  for select to authenticated using (true);
