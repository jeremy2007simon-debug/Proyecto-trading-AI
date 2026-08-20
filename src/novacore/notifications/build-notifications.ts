import "server-only";

import { buildActivityFeed } from "@/novacore/activity-feed/build-activity-feed";
import { getRs3mExecutionSafety } from "@/novacore/execution-center/adapters/rs3m-guards-adapter";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";
import type { NovaCoreEventType } from "@/novacore/events/types";
import type { NotificationCategory, NotificationPriority, NovaCoreNotification } from "@/novacore/notifications/types";

/**
 * Which historical event types become notifications, and at what
 * category/priority. Event types not listed here (e.g.
 * `FORWARD_EVIDENCE_RECORDED`, which is a low-level ledger write that a
 * more specific event already summarizes — see
 * `rs3m-event-adapter.ts`) are intentionally excluded to avoid noise —
 * the brief asks for "few things per screen", not every raw event
 * mirrored as a notification.
 */
const EVENT_NOTIFICATION_MAP: Partial<Record<NovaCoreEventType, { category: NotificationCategory; priority: NotificationPriority }>> = {
  STRATEGY_SIGNAL: { category: "SIGNAL", priority: "INFO" },
  STRATEGY_STATUS_CHANGED: { category: "SYSTEM", priority: "INFO" },
  SIGNAL_GENERATED: { category: "SIGNAL", priority: "INFO" },
  SIGNAL_AWAITING_APPROVAL: { category: "APPROVAL", priority: "IMPORTANT" },
  APPROVAL_GRANTED: { category: "APPROVAL", priority: "INFO" },
  GUARD_BLOCKED: { category: "RISK", priority: "IMPORTANT" },
  ORDER_SUBMITTED: { category: "ORDER", priority: "INFO" },
  ORDER_FILLED: { category: "ORDER", priority: "IMPORTANT" },
  ORDER_REJECTED: { category: "ORDER", priority: "CRITICAL" },
  MONTHLY_PERFORMANCE_RECORDED: { category: "RISK", priority: "INFO" },
  BROKER_ERROR: { category: "SYSTEM", priority: "CRITICAL" },
  RESEARCH_EXPERIMENT_COMPLETED: { category: "RESEARCH", priority: "INFO" },
  CANDIDATE_CREATED: { category: "RESEARCH", priority: "INFO" },
  SYSTEM_WARNING: { category: "SYSTEM", priority: "IMPORTANT" },
  SYSTEM_ERROR: { category: "SYSTEM", priority: "CRITICAL" },
};

const PRIORITY_RANK: Record<NotificationPriority, number> = { CRITICAL: 3, IMPORTANT: 2, INFO: 1 };

export interface BuildNotificationsOptions {
  limit?: number;
}

/**
 * Builds the current notification list from three real, already-computed
 * sources: the unified Activity Feed (historical events), live System
 * Health checks, and the live Execution Safety guard snapshot. Live-state
 * notifications (health/guards) are re-derived on every call — they
 * represent "what's true right now", not a persisted event — and are
 * timestamped `now` so they naturally surface at the top of a
 * chronological view; the notification center itself sorts by priority
 * first, recency second, so a CRITICAL historical event still outranks
 * an INFO live check.
 */
export async function buildNovaCoreNotifications(options: BuildNotificationsOptions = {}): Promise<NovaCoreNotification[]> {
  const notifications: NovaCoreNotification[] = [];
  const now = new Date().toISOString();

  for (const event of buildActivityFeed({ limit: 50 })) {
    const mapping = EVENT_NOTIFICATION_MAP[event.type];
    if (!mapping) continue;
    notifications.push({
      id: `event:${event.id}`,
      category: mapping.category,
      priority: mapping.priority,
      message: event.summary,
      timestamp: event.timestamp,
      href: event.domain === "research" ? "/novacore/research" : `/novacore/bots/${event.strategyId ?? ""}`,
      sourceDoc: event.sourceDoc,
    });
  }

  const health = await getRs3mHealth();
  for (const check of health.checks) {
    if (check.status === "HEALTHY") continue;
    notifications.push({
      id: `health:${check.name}`,
      category: "SYSTEM",
      priority: check.status === "ERROR" ? "CRITICAL" : "IMPORTANT",
      message: `${check.name}: ${check.status}`,
      detail: check.detail,
      timestamp: check.observedAt ?? now,
      href: "/novacore/system",
    });
  }

  const safety = await getRs3mExecutionSafety();
  if (safety.approvalStatus === "REQUIRED") {
    notifications.push({
      id: "safety:approval-required",
      category: "APPROVAL",
      priority: "IMPORTANT",
      message: "Aprobación manual requerida para el mes de decisión actual",
      timestamp: now,
      href: "/novacore/bots/RS3M_CANDIDATE_V1",
    });
  }
  if (safety.overallStatus === "BLOCKED") {
    const blocked = safety.guards.filter((g) => g.status === "BLOCKED").map((g) => g.guardCode);
    notifications.push({
      id: "safety:blocked",
      category: "RISK",
      priority: "CRITICAL",
      message: `Ejecución bloqueada por guard(s): ${blocked.join(", ") || "desconocido"}`,
      timestamp: now,
      href: "/novacore/bots/RS3M_CANDIDATE_V1",
    });
  }

  const sorted = notifications.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.timestamp.localeCompare(a.timestamp));
  return options.limit ? sorted.slice(0, options.limit) : sorted;
}
