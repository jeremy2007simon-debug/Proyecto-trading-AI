import { LineChart } from "@/components/backtesting/LineChart";
import { StatTile } from "@/components/dashboard/StatTile";
import { MetricScopeBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { RiskAnalyticsSnapshot } from "@/novacore/risk-analytics/types";

/**
 * "Forward Paper Performance" panel (Observability Upgrade §6). When
 * `forwardMetrics.available` is false (0 months observed, the current
 * state of this environment), renders the explicit empty state — never a
 * fabricated historical-looking curve presented as forward.
 */
export function ForwardPerformancePanel({ forwardMetrics }: { forwardMetrics: RiskAnalyticsSnapshot["forwardMetrics"] }) {
  if (!forwardMetrics.available) {
    return (
      <Card>
        <CardHeader title="Forward paper performance" action={<MetricScopeBadge scope="FORWARD_PAPER" />} />
        <CardBody className="p-4">
          <div className="rounded-xl border border-dashed border-border bg-surface/50 px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">{forwardMetrics.emptyStateMessage}</p>
            <p className="mx-auto mt-2 max-w-md text-xs text-muted">{forwardMetrics.reason}</p>
          </div>
        </CardBody>
      </Card>
    );
  }

  const hasSpy = forwardMetrics.normalizedCurve.spy.length > 0;

  return (
    <Card>
      <CardHeader title="Forward paper performance" description={`${forwardMetrics.monthsObserved} month(s) observed`} action={<MetricScopeBadge scope="FORWARD_PAPER" />} />
      <CardBody className="p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Starting equity" value={forwardMetrics.startingEquityUsd !== undefined ? `$${forwardMetrics.startingEquityUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"} />
          <StatTile label="Current equity" value={forwardMetrics.currentEquityUsd !== undefined ? `$${forwardMetrics.currentEquityUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"} />
          <StatTile label="Total return" value={forwardMetrics.totalReturnPct !== undefined ? `${forwardMetrics.totalReturnPct.toFixed(2)}%` : "—"} />
          <StatTile label="CAGR" value={forwardMetrics.cagrPct !== undefined ? `${forwardMetrics.cagrPct.toFixed(2)}%` : "n/a (needs ≥2 months)"} />
          <StatTile label="Max drawdown" value={`${forwardMetrics.maxDrawdownPct.toFixed(2)}%`} />
          <StatTile label="Current drawdown" value={forwardMetrics.currentDrawdownPct !== undefined ? `${forwardMetrics.currentDrawdownPct.toFixed(2)}%` : "—"} />
          <StatTile label="Winning months" value={forwardMetrics.winningMonths} />
          <StatTile label="Losing months" value={forwardMetrics.losingMonths} />
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs text-muted">RS3M Paper vs. SPY — normalized to 100 at forward start</p>
          {hasSpy ? (
            <LineChart points={forwardMetrics.normalizedCurve.rs3m.map((p, i) => ({ x: i, y: p.value }))} color="var(--accent)" referenceY={100} />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted">SPY benchmark leg unavailable — showing RS3M only.</div>
          )}
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">{forwardMetrics.disclaimer}</p>
      </CardBody>
    </Card>
  );
}
