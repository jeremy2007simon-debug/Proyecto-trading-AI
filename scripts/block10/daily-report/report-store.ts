/**
 * Block 10.1 §8/§18/§31 — the ONLY writer of Daily Close Reports. Each
 * report is stored as ONE immutable file per trading date:
 * `results/block10/daily-reports/{date}.json`. "Immutable" is enforced
 * structurally here, not just by convention: `writeReportIfAbsent` never
 * overwrites an existing file — a report, once generated, is never
 * silently recomputed with later/different data (§18: "Do not
 * recalculate old reports with future data unless explicitly marked as
 * recomputed" — this module doesn't even expose a recompute path).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NovaCoreDailyCloseReport } from "@/novacore/reports/daily-close/types";

const REPORTS_DIR = join(process.cwd(), "results", "block10", "daily-reports");

function reportPath(date: string): string {
  return join(REPORTS_DIR, `${date}.json`);
}

export function hasReportForDate(date: string): boolean {
  return existsSync(reportPath(date));
}

export interface WriteReportResult {
  written: boolean;
  reason?: string;
}

/** Writes the report ONLY if no file already exists for its `date`. Returns `written: false` (never throws, never overwrites) if one already does — this IS the idempotency guarantee for report generation. */
export function writeReportIfAbsent(report: NovaCoreDailyCloseReport): WriteReportResult {
  if (hasReportForDate(report.date)) {
    return { written: false, reason: `A report for ${report.date} already exists — refusing to overwrite (reports are immutable once written).` };
  }
  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(reportPath(report.date), JSON.stringify(report, null, 2));
  return { written: true };
}

export function readReport(date: string): NovaCoreDailyCloseReport | undefined {
  const path = reportPath(date);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as NovaCoreDailyCloseReport;
}

/** All recorded report dates, newest first. Returns `[]` (never throws) when the directory doesn't exist yet. */
export function listReportDates(): string[] {
  if (!existsSync(REPORTS_DIR)) return [];
  return readdirSync(REPORTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort((a, b) => b.localeCompare(a));
}
