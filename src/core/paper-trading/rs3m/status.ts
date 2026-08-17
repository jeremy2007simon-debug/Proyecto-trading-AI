/**
 * Block 6, Fase 24 — RS3M_CANDIDATE_V1's append-only status history.
 *
 * `VALIDATED` deliberately does not exist anywhere in this type — it is
 * structurally impossible to reach it through this model, matching the
 * spec's explicit "nunca VALIDATED de forma automática" (and, in
 * practice, never at all through this codebase). `PAPER_READY` means
 * "audit passed, infra ready, dry-run correct" — never "the strategy
 * works," and this module encodes that distinction by keeping
 * `PAPER_READY` and `FORWARD_VERIFIED` as separate, non-adjacent-by-default
 * states requiring real elapsed paper-trading time in between (see the
 * Block 6 report's "paper trading duration" section for the actual
 * elapsed-time policy — this module only enforces which transitions are
 * STRUCTURALLY valid, not how long to wait).
 */

export type Rs3mStatus = "CANDIDATE_FROZEN" | "AUDIT_PASSED" | "AUDIT_FAILED" | "PAPER_READY" | "PAPER_RUNNING" | "PAPER_PAUSED" | "REJECTED_FORWARD" | "FORWARD_VERIFIED";

export interface StatusTransition {
  status: Rs3mStatus;
  timestamp: string;
  reason: string;
}

const ALLOWED_TRANSITIONS: Record<Rs3mStatus, readonly Rs3mStatus[]> = {
  CANDIDATE_FROZEN: ["AUDIT_PASSED", "AUDIT_FAILED"],
  AUDIT_PASSED: ["PAPER_READY", "AUDIT_FAILED"],
  AUDIT_FAILED: [],
  PAPER_READY: ["PAPER_RUNNING"],
  PAPER_RUNNING: ["PAPER_PAUSED", "REJECTED_FORWARD", "FORWARD_VERIFIED"],
  PAPER_PAUSED: ["PAPER_RUNNING", "REJECTED_FORWARD"],
  REJECTED_FORWARD: [],
  FORWARD_VERIFIED: [],
};

export function isValidTransition(from: Rs3mStatus, to: Rs3mStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: Rs3mStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

export interface AppendTransitionResult {
  history: StatusTransition[];
  error?: string;
}

/**
 * Appends `next` to `history` if it's a structurally valid transition —
 * never mutates `history`, always returns a NEW array (even on error, the
 * original is returned unchanged). The very first entry in an empty
 * history must be `CANDIDATE_FROZEN` (the model's only valid starting
 * point — every RS3M candidate begins life frozen).
 */
export function appendTransition(history: readonly StatusTransition[], next: Rs3mStatus, reason: string, nowIso: string): AppendTransitionResult {
  if (history.length === 0) {
    if (next !== "CANDIDATE_FROZEN") {
      return { history: [...history], error: `First-ever status must be CANDIDATE_FROZEN, got "${next}".` };
    }
    return { history: [{ status: next, timestamp: nowIso, reason }] };
  }

  const current = history[history.length - 1].status;
  if (!isValidTransition(current, next)) {
    return { history: [...history], error: `Invalid transition: "${current}" -> "${next}". Allowed from "${current}": ${ALLOWED_TRANSITIONS[current].join(", ") || "(none — terminal state)"}.` };
  }
  return { history: [...history, { status: next, timestamp: nowIso, reason }] };
}

export function currentStatus(history: readonly StatusTransition[]): Rs3mStatus | undefined {
  return history.at(-1)?.status;
}
