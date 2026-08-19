import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { HealthBadge, StrategyStatusBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { buildActivityFeed } from "@/novacore/activity-feed/build-activity-feed";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";
import { getNovaCorePortfolioSnapshot } from "@/novacore/portfolio/adapters/rs3m-portfolio-adapter";
import { getRs3mRiskSnapshot } from "@/novacore/risk-analytics/adapters/rs3m-risk-adapter";
import { listNovaCoreStrategies } from "@/novacore/strategy-hub/registry";

export default async function NovaCoreHomePage() {
  const [strategies, portfolio, health, risk, activity] = await Promise.all([
    Promise.resolve(listNovaCoreStrategies()),
    getNovaCorePortfolioSnapshot(),
    getRs3mHealth(),
    Promise.resolve(getRs3mRiskSnapshot()),
    Promise.resolve(buildActivityFeed({ limit: 6 })),
  ]);

  return (
    <div>
      <PageHeader
        title="NovaCore Trading Lab"
        description="Control plane over the existing research, execution, and risk infrastructure. Read-only — observability before control."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="System" value="ONLINE" hint="Live trading structurally disabled" />
        <StatTile label="Strategies tracked" value={strategies.length} hint="RS3M_CANDIDATE_V1 (Strategy Hub entry #1)" />
        <StatTile
          label="Paper equity"
          value={portfolio.available ? `$${portfolio.totalEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "Unavailable"}
          hint={portfolio.available ? "Alpaca PAPER account" : portfolio.unavailableReason}
        />
        <StatTile label="Overall health" value={<HealthBadge status={health.status} />} hint={`${health.checks.length} checks`} />
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader title="Strategy Hub" description="Every strategy NovaCore currently tracks." action={<Link href="/novacore/strategies" className="text-xs text-accent hover:underline">View all →</Link>} />
          <CardBody className="space-y-3 p-4">
            {strategies.map((strategy) => (
              <Link
                key={strategy.id}
                href={`/novacore/strategies/${strategy.id}`}
                className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 transition-colors hover:border-border sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{strategy.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {strategy.broker} · {strategy.environment} · hash {strategy.candidateHash}
                  </p>
                </div>
                <StrategyStatusBadge status={strategy.status} />
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="RS3M vs benchmarks" description={risk.strategyMetrics.sourceDoc} />
          <CardBody className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
            <StatTile label="CAGR" value={`${risk.strategyMetrics.cagrPct.toFixed(2)}%`} />
            <StatTile label="SPY CAGR" value={`${risk.strategyMetrics.benchmarkReturnPct.toFixed(2)}%`} />
            <StatTile label="Excess" value={`${risk.strategyMetrics.excessReturnPct >= 0 ? "+" : ""}${risk.strategyMetrics.excessReturnPct.toFixed(2)}pp`} />
            <StatTile label="Full-history MaxDD" value={`${risk.strategyMetrics.maxDrawdownPct.toFixed(2)}%`} />
            <StatTile
              label="OOS excess (25mo)"
              value={`${risk.oosMetrics.excessReturnVsSpyPct.toFixed(2)}pp`}
              valueClassName={risk.oosMetrics.excessReturnVsSpyPct < 0 ? "text-sell" : "text-buy"}
            />
            <StatTile label="Forward months" value={risk.forwardMetrics.monthsObserved} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Activity" description="Most recent NovaCore events." action={<Link href="/novacore/activity" className="text-xs text-accent hover:underline">View all →</Link>} />
          <CardBody className="space-y-2 p-4">
            {activity.length === 0 ? (
              <p className="text-sm text-muted">No events recorded yet.</p>
            ) : (
              activity.map((event) => (
                <div key={event.id} className="border-b border-border-subtle pb-2 last:border-0 last:pb-0">
                  <p className="text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</p>
                  <p className="text-sm text-foreground">{event.summary}</p>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
