/**
 * Block 6, forward-testing — the manual approval RECORD shape. Per the
 * user's explicit request: no monthly rebalance may submit real orders
 * — even paper ones — without an explicit human approval recorded for
 * that EXACT decision month and candidate hash, until the user
 * explicitly disables this mode (`RS3M_REQUIRE_APPROVAL=false` — see
 * `run-rebalance.ts`).
 *
 * The actual GUARD (`assertApprovalGranted`) lives in `safety-guards.ts`
 * alongside every other guard, and takes a plain resolved boolean — this
 * file only defines the data shape `approval-store.ts` (I/O) persists
 * and reads back, so it has zero dependents inside `src/core` and can't
 * form an import cycle with the guard module.
 *
 * An approval can never "reach past" a guard that would otherwise block:
 * because `rs3m-engine.ts#execute()` always calls `computePlan()` (which
 * evaluates ALL guards fresh, including staleness and candidate-hash
 * tampering) before submitting anything, an approval recorded days ago
 * for a signal that has since gone stale is still caught by
 * `assertSignalNotStale` regardless of approval.
 */
export interface RebalanceApproval {
  decisionMonth: string;
  candidateHash: string;
  approvedAt: string;
  /** Free-text note from whoever approved (e.g. "approved via chat, 2026-09-02") — never a credential, never parsed. */
  approvedBy: string;
}
