import type { Rs3mPlanResult } from "@/core/paper-trading/rs3m/rs3m-engine";
import type { Rs3mNotificationEventType } from "@/core/paper-trading/rs3m/notification-events";

/**
 * Block 6, forward-testing — pure decision logic for WHETHER a blocked
 * dry-run plan should generate an external notification. Extracted out
 * of `run-rebalance.ts` (all I/O) specifically so this policy is
 * directly unit-testable without mocking the whole script — the user's
 * explicit anti-spam requirement ("STALE_SIGNAL normal fuera de la
 * ventana de rebalanceo NO necesita notificación diaria") needs its own
 * test, not an inference from reading the script.
 *
 * `STALE_SIGNAL` blocks roughly 20 of every ~30 days (the signal is only
 * fresh for about the first 10 days after each month's close) — that is
 * the EXPECTED, ROUTINE state of the system on most days, not something
 * to alert on. `AWAITING_APPROVAL` is the opposite: exactly the moment a
 * human is waiting for, but the caller (`run-rebalance.ts`, via
 * `approval-store.ts#hasAwaitingApprovalMarker`) is responsible for
 * firing it only ONCE per decision month, not on every one of this
 * policy's `true` results.
 *
 * IMPORTANT: while approval mode is on (the default), `APPROVAL_REQUIRED`
 * is ALSO present alongside `STALE_SIGNAL` on every one of those routine
 * days — a stale signal can never be validly approved anyway (see
 * `safety-guards.test.ts`'s "an approval never bypasses a stale signal"),
 * so its co-occurrence with staleness carries no extra information and
 * must NOT by itself turn a routine day into a notification. A genuinely
 * unexpected guard (e.g. `CANDIDATE_HASH_MISMATCH`) alongside staleness
 * still must notify.
 */

export type BlockedPlanNotificationDecision = { notify: false } | { notify: true; type: Rs3mNotificationEventType };

const EXPECTED_ROUTINE_GUARDS = new Set(["STALE_SIGNAL", "APPROVAL_REQUIRED"]);

/** True when every violation is STALE_SIGNAL and/or the (expected, redundant-with-staleness) APPROVAL_REQUIRED — the routine, no-notification case. Any OTHER guard present is NOT routine and must still notify. */
export function isRoutineStaleSignalOnly(planResult: Rs3mPlanResult): boolean {
  const { violations } = planResult.guardResult;
  return violations.some((v) => v.guard === "STALE_SIGNAL") && violations.every((v) => EXPECTED_ROUTINE_GUARDS.has(v.guard));
}

export function classifyBlockedPlanNotification(planResult: Rs3mPlanResult): BlockedPlanNotificationDecision {
  if (planResult.wouldExecute) return { notify: false };
  if (planResult.blockedReason === "NO_REBALANCE_NEEDED") return { notify: false };
  if (planResult.blockedReason === "AWAITING_APPROVAL") return { notify: true, type: "SIGNAL_AWAITING_APPROVAL" };
  if (isRoutineStaleSignalOnly(planResult)) return { notify: false };

  const hasStale = planResult.guardResult.violations.some((v) => v.guard === "STALE_SIGNAL");
  return { notify: true, type: hasStale ? "STALE_SIGNAL" : "GUARD_BLOCKED" };
}
