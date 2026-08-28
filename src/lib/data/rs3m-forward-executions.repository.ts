import "server-only";

import type { ForwardEvidenceRecord } from "@/core/paper-trading/rs3m/forward-evidence";
import type { Rs3mApprovalStatus, Rs3mSignalFreshness } from "../../../scripts/block6/paper/forward-execution-observability";
import { createSupabaseServiceRoleClient, createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Block 6 forward-testing observability (Supabase persistence). Durable,
 * queryable counterpart to `results/block6/forward/ledger.jsonl`
 * (`scripts/block6/paper/forward-evidence-store.ts`) — that file is
 * local to whichever ephemeral container the Routine's daily firing runs
 * in, so an audit from a different session/container has no way to read
 * it. This table (`0005_rs3m_forward_executions.sql`) is the durable
 * copy: one row per rebalance attempt, executed OR blocked, never
 * updated after insert.
 *
 * `logRs3mForwardExecution` is called from `run-rebalance.ts` as a
 * best-effort side effect AFTER a trading decision (or its absence) is
 * already final — a Supabase outage here must never change, delay, or
 * retry a guard/execution decision, so the caller wraps this in a
 * try/catch and only logs the failure; it never surfaces up into the
 * scheduler's own control flow.
 */
export interface Rs3mForwardExecutionInput {
  executionId: string;
  occurredAt: string;
  evidence: ForwardEvidenceRecord;
  signalFreshness: Rs3mSignalFreshness;
  approvalStatus: Rs3mApprovalStatus;
  /** Whatever's useful/public from the broker interaction for this attempt (e.g. order ids/statuses, or the account/positions-read error message) — never credentials. */
  brokerResponse?: Record<string, unknown>;
  /** Set only when `run-rebalance.ts`'s own top-level catch fired for this attempt. */
  errorMessage?: string;
}

export async function logRs3mForwardExecution(input: Rs3mForwardExecutionInput): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { evidence } = input;

  const { error } = await supabase.from("rs3m_forward_executions").insert({
    execution_id: input.executionId,
    occurred_at: input.occurredAt,
    candidate_id: evidence.candidateId,
    candidate_hash: evidence.candidateHash,
    decision_month: evidence.decisionMonth ?? null,
    data_cutoff: evidence.dataCutoff ?? null,
    ranking: evidence.ranking,
    selected_asset: evidence.winner ?? null,
    signal_freshness: input.signalFreshness,
    account_equity_usd: evidence.accountEquityUsd ?? null,
    account_equity_after_usd: evidence.accountEquityAfterUsd ?? null,
    positions_before: evidence.positionsBefore ?? null,
    positions_after: evidence.positionsAfter ?? null,
    target_asset: evidence.targetAsset ?? null,
    proposed_orders: evidence.proposedOrders,
    estimated_turnover_pct: evidence.estimatedTurnoverPct ?? null,
    reference_rebalance_cost_bps: evidence.referenceRebalanceCostBps,
    guard_violations: evidence.guardViolations,
    approval_status: input.approvalStatus,
    orders_submitted: evidence.submittedOrders,
    broker_response: input.brokerResponse ?? null,
    any_order_still_in_flight: evidence.anyOrderStillInFlight ?? null,
    final_state: evidence.finalState,
    skip_reason: evidence.skipReason ?? null,
    error_message: input.errorMessage ?? null,
    mode: evidence.mode,
  });

  if (error) throw new Error(`Failed to persist RS3M forward execution to Supabase: ${error.message}`);
}

export async function getLatestRs3mForwardExecution() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("rs3m_forward_executions")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to read latest RS3M forward execution: ${error.message}`);
  return data;
}

export async function listRs3mForwardExecutions(limit = 50) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("rs3m_forward_executions")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list RS3M forward executions: ${error.message}`);
  return data ?? [];
}
