import "server-only";

import type { NovaCoreEvent } from "@/novacore/events/types";
import { listReportDates, readReport } from "../../../../scripts/block10/daily-report/report-store";

/**
 * Block 10.1 §15/§17/§20 — maps every persisted Daily Close Report into
 * the common `NovaCoreEvent` shape (read-only, mirrors `rs3m-event-
 * adapter.ts`/`ca-shadow-event-adapter.ts`), so the Activity Feed and
 * Notification Center pick up "a report is ready" automatically — this
 * IS the NovaCore in-app delivery channel (see
 * `delivery/novacore-in-app-provider.ts`): a report becomes visible the
 * moment it's persisted and this adapter surfaces it, no separate
 * notification database required.
 *
 * Priority (INFO/IMPORTANT/CRITICAL) is derived from the report's own
 * `attention` list, per §15/§36: a normal day is INFO, an approval-
 * required or blocked/degraded day is IMPORTANT, and a broker/hash/
 * critical-health issue escalates to CRITICAL.
 */
function derivePriority(report: ReturnType<typeof readReport>): "INFO" | "IMPORTANT" | "CRITICAL" {
  if (!report) return "INFO";
  if (report.attention.some((a) => a.type === "HASH_MISMATCH" || a.type === "BROKER_UNAVAILABLE")) return "CRITICAL";
  if (report.attention.length > 0) return "IMPORTANT";
  return "INFO";
}

export function getDailyReportEvents(): NovaCoreEvent[] {
  const events: NovaCoreEvent[] = [];

  for (const date of listReportDates()) {
    const report = readReport(date);
    if (!report) continue;
    const priority = derivePriority(report);

    events.push({
      id: `daily-report-${date}`,
      type: "DAILY_CLOSE_REPORT_READY",
      domain: "system",
      timestamp: report.generatedAt,
      summary: `Daily Close Report listo para ${date}${report.attention.length > 0 ? ` — ${report.attention.length} punto(s) de atención` : " — sin incidencias"}.`,
      detail: { date, priority, attentionCount: report.attention.length },
      sourceDoc: `results/block10/daily-reports/${date}.json`,
    });
  }

  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
