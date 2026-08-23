import type { ReportValue } from "@/novacore/reports/daily-close/types";

/** Pure formatting helpers shared by the reports list and detail pages — kept out of any component so they're trivially unit-testable and never drift between the two pages. */

export function formatReportValue<T>(v: ReportValue<T>, format: (value: T) => string): string {
  if (v.status === "OK") return format(v.value);
  return v.status === "NOT_CONNECTED" ? "No conectado" : "Sin datos";
}

export function formatUsd(n: number): string {
  return `${n >= 0 ? "+" : "-"}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatUsdPlain(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
