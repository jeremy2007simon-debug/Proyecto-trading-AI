import type { ISOTimestamp } from "@/novacore/shared/types";

/**
 * Observability Upgrade §14 — Notification Center. Every notification is
 * derived from a real, already-computed source (the Activity Feed, live
 * health checks, live execution-safety guards) — this module never
 * invents an event. No execution controls are exposed from a
 * notification; `href` only ever points at a read-only NovaCore page.
 */
export type NotificationCategory = "SIGNAL" | "APPROVAL" | "ORDER" | "SYSTEM" | "RISK" | "RESEARCH" | "REPORT";
export type NotificationPriority = "INFO" | "IMPORTANT" | "CRITICAL";

export interface NovaCoreNotification {
  id: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  message: string;
  detail?: string;
  timestamp: ISOTimestamp;
  href?: string;
  sourceDoc?: string;
}
