import type { HealthCheck, HealthStatus, HealthSummary } from "@/novacore/shared/types";

/**
 * Block 7, section 10 — Health System. Pure, deterministic combinator:
 * given a list of individual checks (Routine, market data, broker
 * connectivity, credentials, staleness, execution errors, ...), returns
 * the worst status among them plus the full check list, so a UI can show
 * both the summary badge and the detail.
 *
 * Deliberately has no knowledge of strategy PERFORMANCE — a losing
 * strategy with a healthy Routine, fresh data, and no execution errors is
 * HEALTHY (Block 7 section 10's explicit distinction). Performance lives
 * in `src/novacore/risk-analytics`, never here.
 */

const SEVERITY: Record<HealthStatus, number> = {
  HEALTHY: 0,
  WARNING: 1,
  DEGRADED: 2,
  ERROR: 3,
  OFFLINE: 4,
};

export function combineHealth(checks: readonly HealthCheck[]): HealthSummary {
  if (checks.length === 0) {
    return { status: "OFFLINE", checks: [] };
  }
  const worst = checks.reduce<HealthStatus>((acc, c) => (SEVERITY[c.status] > SEVERITY[acc] ? c.status : acc), "HEALTHY");
  return { status: worst, checks: [...checks] };
}
