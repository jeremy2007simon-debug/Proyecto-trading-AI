import type { ShadowDayResult } from "@/core/ca-shadow/shadow-engine";

/**
 * Block 10 §15 — CA Shadow's external alert vocabulary. Same pure,
 * I/O-free pattern as `src/core/paper-trading/rs3m/notification-
 * events.ts`. Deliberately NOT `Rs3mNotificationEventType` — a shared
 * union would let a future edit to one strategy's event set silently
 * change the other's. No approval-request event exists here: there is no
 * real order, so nothing ever needs a human's sign-off (§15: "no se
 * requiere aprobación humana").
 */
export type CaNotificationEventType = "CA_SIGNAL" | "CA_SHADOW_ENTRY" | "CA_SHADOW_EXIT" | "CA_SHADOW_ERROR" | "CA_DATA_STALE";

export interface CaNotificationEvent {
  type: CaNotificationEventType;
  timestamp: string;
  summary: string;
  detail: Record<string, unknown>;
}

export function formatCaNotificationMessage(event: CaNotificationEvent): string {
  const detailLine = Object.entries(event.detail)
    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" ");
  return `[CA_CANDIDATE_V1][SHADOW] ${event.type} — ${event.summary}${detailLine ? ` (${detailLine})` : ""}`;
}

/**
 * Derives 0+ notification events from one shadow-day result. Deliberately
 * NOT one event per day, to avoid the spam §15 explicitly warns against:
 * a plain non-triggered HOLD_FLAT day produces nothing. `CA_SIGNAL` fires
 * only when the canonical signal actually triggers (informational, ahead
 * of/alongside the resulting ENTER); `CA_DATA_STALE` fires specifically
 * for a `DATA_STALE` guard violation; any OTHER blocked reason fires the
 * more general `CA_SHADOW_ERROR`.
 */
export function buildCaNotificationEvents(dayResult: ShadowDayResult): CaNotificationEvent[] {
  const events: CaNotificationEvent[] = [];
  const base = { timestamp: dayResult.dataCutoff, detail: { date: dayResult.date, candidateHash: dayResult.candidateHash } };

  if (dayResult.signal?.triggered) {
    events.push({ type: "CA_SIGNAL", timestamp: base.timestamp, summary: `Canonical signal triggered on ${dayResult.date} (decisionReturn=${dayResult.signal.decisionReturn.toFixed(4)}, threshold=${dayResult.signal.percentileThreshold.toFixed(4)}).`, detail: base.detail });
  }
  if (dayResult.decision === "ENTER") {
    events.push({ type: "CA_SHADOW_ENTRY", timestamp: base.timestamp, summary: `Hypothetical entry at ${dayResult.hypotheticalFillPrice} on ${dayResult.date}.`, detail: { ...base.detail, fillPrice: dayResult.hypotheticalFillPrice, costBps: dayResult.costBps } });
  }
  if (dayResult.decision === "EXIT") {
    events.push({ type: "CA_SHADOW_EXIT", timestamp: base.timestamp, summary: `Hypothetical exit at ${dayResult.hypotheticalFillPrice} on ${dayResult.date}, dailyPnlPct=${(dayResult.dailyPnlPct * 100).toFixed(2)}%.`, detail: { ...base.detail, fillPrice: dayResult.hypotheticalFillPrice, dailyPnlPct: dayResult.dailyPnlPct } });
  }
  if (dayResult.decision === "BLOCKED") {
    const isStale = dayResult.guardResult.violations.some((v) => v.guard === "DATA_STALE");
    events.push({
      type: isStale ? "CA_DATA_STALE" : "CA_SHADOW_ERROR",
      timestamp: base.timestamp,
      summary: `Shadow evaluation blocked on ${dayResult.date}: ${dayResult.guardResult.violations.map((v) => v.guard).join(", ")}.`,
      detail: { ...base.detail, violations: dayResult.guardResult.violations },
    });
  }
  return events;
}
