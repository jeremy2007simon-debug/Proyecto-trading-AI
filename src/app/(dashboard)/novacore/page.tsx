import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { ExecutionSafetyPanel } from "@/components/novacore/ExecutionSafetyPanel";
import { SignalCard } from "@/components/novacore/SignalCard";
import { HealthBadge, StrategyStatusBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { buildActivityFeed } from "@/novacore/activity-feed/build-activity-feed";
import { getRs3mExecutionSnapshot } from "@/novacore/execution-center/adapters/rs3m-execution-adapter";
import { getRs3mExecutionSafety } from "@/novacore/execution-center/adapters/rs3m-guards-adapter";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";
import { getNovaCorePortfolioSnapshot } from "@/novacore/portfolio/adapters/rs3m-portfolio-adapter";
import { getRs3mRiskSnapshot } from "@/novacore/risk-analytics/adapters/rs3m-risk-adapter";
import { getRs3mCurrentSignal } from "@/novacore/strategy-hub/adapters/rs3m-signal-adapter";
import { listNovaCoreStrategies } from "@/novacore/strategy-hub/registry";

/**
 * NovaCore home — laid out around the 10 questions from the Observability
 * Upgrade brief (§11): is the system healthy, what's the active strategy,
 * what signal do we have, is anything awaiting my approval, what Paper
 * position/equity do we hold, are we up or down, how do we compare to
 * SPY, is any guard blocking something, and when was this last updated.
 * Mobile-first — this is the view checked most often from a phone.
 */
export default async function NovaCoreHomePage() {
  const [strategies, portfolio, health, risk, signal, safety, activity] = await Promise.all([
    Promise.resolve(listNovaCoreStrategies()),
    getNovaCorePortfolioSnapshot(),
    getRs3mHealth(),
    getRs3mRiskSnapshot(),
    Promise.resolve(getRs3mCurrentSignal()),
    getRs3mExecutionSafety(),
    Promise.resolve(buildActivityFeed({ limit: 6 })),
  ]);

  const execution = await getRs3mExecutionSnapshot();

  const forwardAvailable = risk.forwardMetrics.available;
  const pnlValue = forwardAvailable ? risk.forwardMetrics.totalReturnPct : undefined;
  const vsSpyValue = forwardAvailable ? risk.forwardMetrics.excessReturnVsSpyPct : undefined;

  const lastUpdated = portfolio.lastSyncedAt ?? signal.recordedAt;

  return (
    <div>
      <PageHeader
        title="NovaCore Trading Lab"
        description="Panel de control sobre la infraestructura existente de investigación, ejecución y riesgo. Solo lectura — observabilidad antes que control."
      />

      {/* 1-10: answer every priority question at a glance, mobile-first (2 cols on phone, up to 5 on desktop). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="1. Sistema" value={<HealthBadge status={health.status} />} hint={`${health.checks.length} checks`} />
        <StatTile label="2. Estrategia activa" value="RS3M" hint={(strategies[0]?.status ?? "PAPER_READY").replace(/_/g, " ")} />
        <StatTile label="3. Señal" value={signal.winner ?? (signal.status === "UNAVAILABLE" ? "N/D" : "CASH")} hint={signal.status.replace(/_/g, " ")} />
        <StatTile
          label="4. Aprobación"
          value={safety.approvalStatus === "REQUIRED" ? "Pendiente" : safety.approvalStatus === "APPROVED" ? "OK" : safety.approvalStatus === "N/A" ? "N/A" : "No aprobada"}
          valueClassName={safety.approvalStatus === "REQUIRED" ? "text-wait" : undefined}
        />
        <StatTile label="5. Posición Paper" value={execution.currentPosition.symbol ?? execution.currentPosition.state} hint={execution.currentPosition.provenance} />
        <StatTile label="6. Equity Paper" value={portfolio.available ? `$${portfolio.totalEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "No disponible"} />
        <StatTile
          label="7. P&L forward"
          value={pnlValue !== undefined ? `${pnlValue >= 0 ? "+" : ""}${pnlValue.toFixed(2)}%` : "Sin datos"}
          valueClassName={pnlValue !== undefined ? (pnlValue >= 0 ? "text-buy" : "text-sell") : undefined}
        />
        <StatTile
          label="8. vs. SPY (forward)"
          value={vsSpyValue !== undefined ? `${vsSpyValue >= 0 ? "+" : ""}${vsSpyValue.toFixed(2)}pp` : "Sin datos"}
          valueClassName={vsSpyValue !== undefined ? (vsSpyValue >= 0 ? "text-buy" : "text-sell") : undefined}
        />
        <StatTile
          label="9. Guards"
          value={safety.overallStatus}
          valueClassName={safety.overallStatus === "BLOCKED" ? "text-sell" : safety.overallStatus === "AWAITING_APPROVAL" ? "text-wait" : undefined}
        />
        <StatTile label="10. Última actualización" value={lastUpdated ? new Date(lastUpdated).toLocaleString("es-ES") : "N/D"} />
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader title="Strategy Hub" description="Todas las estrategias que sigue NovaCore." action={<Link href="/novacore/strategies" className="text-xs text-accent hover:underline">Ver todas →</Link>} />
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
        <SignalCard signal={signal} />
        <ExecutionSafetyPanel safety={safety} />
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader title="Actividad" description="Eventos más recientes de NovaCore." action={<Link href="/novacore/activity" className="text-xs text-accent hover:underline">Ver todo →</Link>} />
          <CardBody className="space-y-2 p-4">
            {activity.length === 0 ? (
              <p className="text-sm text-muted">Todavía no hay eventos registrados.</p>
            ) : (
              activity.map((event) => (
                <div key={event.id} className="border-b border-border-subtle pb-2 last:border-0 last:pb-0">
                  <p className="text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleString("es-ES")}</p>
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
