import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { ExecutionSafetyPanel } from "@/components/novacore/ExecutionSafetyPanel";
import { ForwardPerformancePanel } from "@/components/novacore/ForwardPerformancePanel";
import { SignalCard } from "@/components/novacore/SignalCard";
import { HealthBadge, MetricScopeBadge, StrategyStatusBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { getRs3mExecutionSnapshot } from "@/novacore/execution-center/adapters/rs3m-execution-adapter";
import { getRs3mExecutionSafety } from "@/novacore/execution-center/adapters/rs3m-guards-adapter";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";
import { getRs3mRiskSnapshot } from "@/novacore/risk-analytics/adapters/rs3m-risk-adapter";
import { getRs3mCurrentSignal } from "@/novacore/strategy-hub/adapters/rs3m-signal-adapter";
import { getNovaCoreStrategyById } from "@/novacore/strategy-hub/registry";

export default async function NovaCoreStrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const strategy = getNovaCoreStrategyById(id);
  if (!strategy) notFound();

  const isRs3m = id === RS3M_CANDIDATE_V1.candidateId;
  const [execution, risk, health, safety, signal] = isRs3m
    ? await Promise.all([getRs3mExecutionSnapshot(), getRs3mRiskSnapshot(), getRs3mHealth(), getRs3mExecutionSafety(), Promise.resolve(getRs3mCurrentSignal())])
    : [undefined, undefined, undefined, undefined, undefined];

  return (
    <div>
      <PageHeader
        title={strategy.name}
        description={`${strategy.family.replace(/_/g, " ")} · v${strategy.version} · hash del candidato ${strategy.candidateHash ?? "n/d"}`}
        action={<StrategyStatusBadge status={strategy.status} />}
      />

      <div className="mb-6 rounded-xl border border-wait/30 bg-wait/5 px-4 py-3 text-xs text-wait">
        <strong>HISTORICAL BACKTEST ≠ FORWARD PAPER RESULTS.</strong> PAPER_READY no significa PAPER_RUNNING. AUDIT_PASSED no significa VALIDATED. No existe el estado VALIDATED para RS3M.
      </div>

      <Card>
        <CardHeader title="Hipótesis" />
        <CardBody className="p-4 text-sm text-muted">{strategy.hypothesis}</CardBody>
      </Card>

      {signal ? (
        <div className="mt-6">
          <SignalCard signal={signal} />
        </div>
      ) : null}

      {strategy.performance?.historical ? (
        <div className="mt-6">
          <Card>
            <CardHeader
              title="Rendimiento histórico"
              description={`${strategy.performance.historical.periodStart} → ${strategy.performance.historical.periodEnd} · ${strategy.performance.historical.sourceDoc}`}
              action={<MetricScopeBadge scope="BACKTEST" />}
            />
            <CardBody className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              <StatTile label="Retorno total" value={`${strategy.performance.historical.totalReturnPct.toFixed(2)}%`} />
              <StatTile label="CAGR" value={`${strategy.performance.historical.cagrPct.toFixed(2)}%`} />
              <StatTile label="Máximo Drawdown" value={`${strategy.performance.historical.maxDrawdownPct.toFixed(2)}%`} />
              <StatTile label="Sharpe" value={strategy.performance.historical.sharpe?.toFixed(2) ?? "—"} />
              <StatTile label="Sortino" value={strategy.performance.historical.sortino?.toFixed(2) ?? "—"} />
              <StatTile label="Calmar" value={strategy.performance.historical.calmar?.toFixed(2) ?? "—"} />
              <StatTile label="CAGR benchmark SPY" value={`${strategy.performance.historical.benchmarkReturnPct?.toFixed(2) ?? "—"}%`} />
              <StatTile
                label="Exceso vs. SPY"
                value={`${(strategy.performance.historical.excessReturnPct ?? 0) >= 0 ? "+" : ""}${strategy.performance.historical.excessReturnPct?.toFixed(2) ?? "—"}pp`}
              />
            </CardBody>
          </Card>
        </div>
      ) : null}

      {risk ? (
        <>
          <div className="mt-6">
            <ForwardPerformancePanel forwardMetrics={risk.forwardMetrics} />
          </div>

          <div className="mt-6">
            <Card>
              <CardHeader title="Hallazgo out-of-sample" description={`${risk.oosMetrics.periodLabel} · ${risk.oosMetrics.sourceDoc}`} action={<MetricScopeBadge scope="OOS" />} />
              <CardBody className="p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatTile label="Exceso vs. SPY" value={`${risk.oosMetrics.excessReturnVsSpyPct.toFixed(2)}pp`} valueClassName="text-sell" />
                  <StatTile label="Alpha (anualizado)" value={`${risk.oosMetrics.alphaAnnualizedPct.toFixed(2)}%`} valueClassName="text-sell" />
                  <StatTile label="Information ratio" value={risk.oosMetrics.informationRatio.toFixed(2)} valueClassName="text-sell" />
                  <StatTile label="Captura de bajadas" value={`${risk.oosMetrics.downsideCapturePct.toFixed(1)}%`} />
                </div>
                <p className="mt-4 text-xs text-muted">{risk.oosMetrics.note}</p>
              </CardBody>
            </Card>
          </div>
        </>
      ) : null}

      {safety ? (
        <div className="mt-6">
          <ExecutionSafetyPanel safety={safety} />
        </div>
      ) : null}

      {execution ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Ejecución" description="Solo lectura / monitorización — sin controles." />
            <CardBody className="space-y-3 p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted">Broker</span><span className="text-foreground">{execution.broker} · {execution.environment}</span></div>
              <div className="flex justify-between"><span className="text-muted">Posición actual</span><span className="text-foreground">{execution.currentPosition.symbol ?? execution.currentPosition.state}</span></div>
              <div className="flex justify-between"><span className="text-muted">Última señal</span><span className="text-foreground">{execution.lastKnownSignal?.winner ?? "Ninguna registrada todavía"}</span></div>
              <div className="flex justify-between"><span className="text-muted">Órdenes enviadas</span><span className="text-foreground">{execution.ordersSubmittedTotal}</span></div>
              <div className="flex justify-between"><span className="text-muted">Aprobación ({execution.approval.currentDecisionMonth})</span><span className="text-foreground">{execution.approval.approvedForCurrentMonth ? "Aprobada" : execution.approval.awaitingApproval ? "Pendiente de aprobación" : "Aún no requerida"}</span></div>
              <div className="flex justify-between"><span className="text-muted">Routine</span><HealthBadge status={execution.routine.status} /></div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Salud del sistema" description="Salud ≠ rendimiento — ver más abajo." />
            <CardBody className="space-y-2 p-4">
              {health?.checks.map((check) => (
                <div key={check.name} className="flex items-start justify-between gap-3 border-b border-border-subtle pb-2 text-sm last:border-0 last:pb-0">
                  <div>
                    <p className="text-foreground">{check.name}</p>
                    <p className="mt-0.5 text-xs text-muted">{check.detail}</p>
                  </div>
                  <HealthBadge status={check.status} />
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      ) : null}

      <div className="mt-6">
        <Card>
          <CardHeader title="Fuente de la verdad" description="De dónde viene cada dato de esta página." />
          <CardBody className="space-y-1 p-4 text-xs">
            {Object.entries(strategy.sourceOfTruth).map(([field, source]) => (
              <div key={field} className="flex flex-col gap-0.5 border-b border-border-subtle py-1.5 last:border-0 sm:flex-row sm:justify-between">
                <span className="text-muted">{field}</span>
                <span className="text-muted-foreground">{source}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
