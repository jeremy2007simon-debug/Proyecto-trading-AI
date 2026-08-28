import type { ForwardEvidenceRecord } from "@/core/paper-trading/rs3m/forward-evidence";

/**
 * Block 6 forward-testing observability — PURELY additive, read-only
 * derivation on top of an already-built `ForwardEvidenceRecord`. Neither
 * function here influences any guard, plan, or order decision; they only
 * summarize a decision that has already been made, into the two
 * questions a non-technical audit asks most often: "is the signal
 * fresh?" and "is this waiting on a human?" — so a Supabase row (or a
 * report) doesn't force a reader to reverse-engineer them from
 * `guardViolations` every time.
 */

export type Rs3mSignalFreshness = "FRESH" | "STALE" | "UNKNOWN";
export type Rs3mApprovalStatus = "AWAITING_APPROVAL" | "APPROVED" | "N/A";

/**
 * STALE takes priority whenever `safety-guards.ts#assertSignalNotStale`
 * fired (its `STALE_SIGNAL` violation survives untouched into the
 * evidence record). Otherwise, freshness can only be assessed once a
 * signal actually exists — `decisionMonth` is `undefined` exactly when
 * `computePlan()` never got that far (malformed/insufficient data, or an
 * account/positions read failure).
 */
export function deriveSignalFreshness(evidence: Pick<ForwardEvidenceRecord, "guardViolations" | "decisionMonth">): Rs3mSignalFreshness {
  if (evidence.guardViolations.some((v) => v.guard === "STALE_SIGNAL")) return "STALE";
  if (evidence.decisionMonth === undefined) return "UNKNOWN";
  return "FRESH";
}

/**
 * `APPROVAL_REQUIRED` in `guardViolations` (from
 * `safety-guards.ts#assertApprovalGranted`) is checked FIRST and wins
 * regardless of `finalState`, since it is the one guard `rs3m-engine.ts`
 * re-evaluates fresh on every call to either `dryRun()` or `execute()` —
 * so it is authoritative even for a direct `execute()` invocation that
 * never went through a preceding `dryRun()` in the same process.
 * Reaching `EXECUTED` or `SKIPPED` at all requires having already passed
 * that guard, which only happens once a human has run
 * `approve-rebalance.ts` for this exact decision month/candidate hash
 * (or the operator explicitly disabled the gate) — this function cannot
 * tell those two apart from the evidence record alone, so both map to
 * `APPROVED`. `NO_REBALANCE_NEEDED` and every other blocked reason
 * (stale signal, malformed data, account unavailable, idempotency,
 * symbol/leverage/short guards) have nothing to do with approval, hence
 * `N/A`.
 */
export function deriveApprovalStatus(evidence: Pick<ForwardEvidenceRecord, "guardViolations" | "finalState">): Rs3mApprovalStatus {
  if (evidence.guardViolations.some((v) => v.guard === "APPROVAL_REQUIRED")) return "AWAITING_APPROVAL";
  if (evidence.finalState === "EXECUTED" || evidence.finalState === "SKIPPED") return "APPROVED";
  return "N/A";
}
