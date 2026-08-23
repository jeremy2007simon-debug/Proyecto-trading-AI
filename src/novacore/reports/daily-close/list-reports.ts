import "server-only";

import type { NovaCoreDailyCloseReport } from "@/novacore/reports/daily-close/types";
import { listReportDates, readReport } from "../../../../scripts/block10/daily-report/report-store";

/** Thin read-only wrapper over `report-store.ts`, matching the rest of NovaCore's "pages import an adapter, adapters reach into scripts/" convention. */
export function listDailyCloseReports(): NovaCoreDailyCloseReport[] {
  return listReportDates()
    .map((date) => readReport(date))
    .filter((r): r is NovaCoreDailyCloseReport => r !== undefined);
}

export function getDailyCloseReport(date: string): NovaCoreDailyCloseReport | undefined {
  return readReport(date);
}

/** The single most recent report, or `undefined` if none have been generated yet — avoids reading/parsing every report file just to find the latest one. */
export function getLatestDailyCloseReport(): NovaCoreDailyCloseReport | undefined {
  const dates = listReportDates(); // already sorted newest-first
  return dates[0] ? readReport(dates[0]) : undefined;
}
