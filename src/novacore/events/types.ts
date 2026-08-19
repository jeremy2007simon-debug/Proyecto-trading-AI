import type { ISOTimestamp } from "@/novacore/shared/types";

/**
 * Block 7, section 11 — common NovaCore event vocabulary. This is an
 * ADDITIVE unification layer, not a replacement: it does not touch
 * `src/core/paper-trading/rs3m/notification-events.ts` (Block 6's own
 * Rs3mNotificationEventType) or `scripts/block6/paper/event-log.ts`.
 * Adapters map those existing event sources into this common shape so the
 * Activity Feed, and eventually notifications/dashboard/mobile-push/audit
 * log, can consume one vocabulary instead of one per subsystem.
 */
export type NovaCoreEventType =
  | "STRATEGY_SIGNAL"
  | "STRATEGY_STATUS_CHANGED"
  | "ORDER_PLANNED"
  | "ORDER_SUBMITTED"
  | "ORDER_FILLED"
  | "ORDER_REJECTED"
  | "GUARD_BLOCKED"
  | "RESEARCH_EXPERIMENT_COMPLETED"
  | "CANDIDATE_CREATED"
  | "SYSTEM_WARNING"
  | "SYSTEM_ERROR";

export type NovaCoreEventDomain = "research" | "strategy" | "execution" | "system";

export interface NovaCoreEvent {
  id: string;
  type: NovaCoreEventType;
  domain: NovaCoreEventDomain;
  timestamp: ISOTimestamp;
  strategyId?: string;
  summary: string;
  /** Never a secret/credential — every adapter must strip those before building this field. */
  detail?: Record<string, unknown>;
  sourceDoc?: string;
}
