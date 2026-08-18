/**
 * Block 6, forward-testing observability — the external alert vocabulary
 * for RS3M paper trading. Deliberately separate from `event-log.ts`'s
 * `Rs3mEventType` (the internal, exhaustive audit log written to
 * `results/block6/paper/events.log`) and from the pre-existing, unrelated
 * `src/core/notifications/types.ts` (a Consensus/Signal-Engine-oriented
 * `Notifier` contract with zero implementations or callers today — wiring
 * RS3M into it would entangle this candidate with that engine, which the
 * Block 6 spec explicitly says NOT to do yet). This is its own small,
 * additive, Block-6-scoped notification model.
 *
 * Pure — no I/O, no `process.env`. `scripts/block6/paper/notifications/`
 * has the actual adapters (console, Telegram) that send these.
 */

export type Rs3mNotificationEventType =
  | "SIGNAL_GENERATED"
  | "DRY_RUN_PASSED"
  /** The one notification the human is actually waiting for: every guard passed except the manual approval gate. Fired ONCE per decision month (see `approval-store.ts#hasAwaitingApprovalMarker`), never repeated daily. */
  | "SIGNAL_AWAITING_APPROVAL"
  | "REBALANCE_STARTED"
  | "ORDER_SUBMITTED"
  | "ORDER_FILLED"
  | "PARTIAL_FILL"
  | "REBALANCE_COMPLETED"
  | "GUARD_BLOCKED"
  | "STALE_SIGNAL"
  | "DATA_ERROR"
  | "BROKER_ERROR"
  | "SCHEDULER_ERROR";

export interface Rs3mNotificationEvent {
  type: Rs3mNotificationEventType;
  timestamp: string;
  /** Short, human-readable, already-safe-to-display summary — never a credential, never raw secret material. */
  summary: string;
  detail: Record<string, unknown>;
}

/** Pure text formatter shared by every adapter, so message wording never drifts channel-to-channel. */
export function formatNotificationMessage(event: Rs3mNotificationEvent): string {
  const detailLine = Object.entries(event.detail)
    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" ");
  return `[RS3M_CANDIDATE_V1] ${event.type} — ${event.summary}${detailLine ? ` (${detailLine})` : ""}`;
}
