import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { BotDetailTabs } from "@/components/novacore/BotDetailTabs";
import { EmptyState } from "@/components/novacore/EmptyState";
import { ExecutionSafetyPanel } from "@/components/novacore/ExecutionSafetyPanel";
import { ForwardPerformancePanel } from "@/components/novacore/ForwardPerformancePanel";
import { SignalCard } from "@/components/novacore/SignalCard";
import { HealthBadge, MetricScopeBadge, StrategyStatusBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatFreshness } from "@/lib/format-freshness";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { buildActivityFeed } from "@/novacore/activity-feed/build-activity-feed";
import { getRs3mExecutionSnapshot } from "@/novacore/execution-center/adapters/rs3m-execution-adapter";
import { getRs3mExecutionSafety } from "@/novacore/execution-center/adapters/rs3m-guards-adapter";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";
import { getNovaCorePortfolioSnapshot } from "@/novacore/portfolio/adapters/rs3m-portfolio-adapter";
import { getRs3mRiskSnapshot } from "@/novacore/risk-analytics/adapters/rs3m-risk-adapter";
import { getRs3mCurrentSignal } from "@/novacore/strategy-hub/adapters/rs3m-signal-adapter";
import { getCaShadowSnapshot, CA_OOS_METRICS, CA_COST_ROBUSTNESS, CA_RS3M_CORRELATION } from "@/novacore/strategy-hub/adapters/ca-shadow-snapshot-adapter";
import { getNovaCoreStrategyById } from "@/novacore/strategy-hub/registry";
import { CaDetailPanels } from "@/components/novacore/CaDetailPanels";

export default async function NovaCoreBotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const strategy = getNovaCoreStrategyById(id);
  if (!strategy) notFound();

  const isRs3m = id === RS3M_CANDIDATE_V1.candidateId;
  const isCa = id === "CA_CANDIDATE_V1";

  const [execution, risk, health, safety, signal, portfolio] = isRs3m
    ? await Promise.all([getRs3mExecutionSnapshot(), getRs3mRiskSnapshot(), getRs3mHealth(), getRs3mExecutionSafety(), Promise.resolve(getRs3mCurrentSignal()), getNovaCorePortfolioSnapshot()])
    : [undefined, undefined, undefined, undefined, undefined, undefined];

  const activity = isRs3m || isCa ? buildActivityFeed({ limit: 100 }).filter((e) => e.strategyId === id) : [];
  const positions = portfolio?.available ? portfolio.positions.filter((p) => p.strategyId === id) : [];
  const orders = portfolio?.available ? portfolio.recentOrders : [];

  const disclaimer = (
    <div className="mb-6 rounded-xl border border-wait/30 bg-wait/5 px-4 py-3 text-xs text-wait">
      <strong>HISTORICAL BACKTEST ≠ FORWARD PAPER RESULTS.</strong> PAPER_READY no significa PAPER_RUNNING. AUDIT_PASSED no significa VALIDATED. No existe el estado VALIDATED para RS3M.
    </div>
  );

  if (isCa) {
    const shadow = getCaShadowSnapshot();
    return (
      <div>
        <PageHeader
          title={strategy.name}
          description={`${strategy.family.replace(/_/g, " ")} · v${strategy.version} · hash ${strategy.candidateHash ?? "n/d"}`}
          action={<StrategyStatusBadge status={strategy.status} />}
        />
        <div className="mb-6 rounded-xl border border-purple-400/30 bg-purple-400/5 px-4 py-3 text-xs text-purple-400">
          <strong>SHADOW ≠ PAPER.</strong> Ninguna orden real fue ni será enviada. Toda posición, fill y P&amp;L de esta página son hipotéticos, calculados por NovaCore — nunca una cuenta de broker.
        </div>
        <CaDetailPanels strategy={strategy} shadow={shadow} activity={activity} oos={CA_OOS_METRICS} cost={CA_COST_ROBUSTNESS} correlation={CA_RS3M_CORRELATION} />
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

  return (
    <div>
      <PageHeader
        title={strategy.name}
        description={`${strategy.family.replace(/_/g, " ")} · v${strategy.version} · hash ${strategy.candidateHash ?? "n/d"}`}
        action={<StrategyStatusBadge status={strategy.status} />}
      />

      <BotDetailTabs
        panels={{
          overview: (
            <div className="space-y-6">
              <Card>
                <CardHeader title="Hipótesis" />
                <CardBody className="p-4 text-sm text-muted">{strategy.hypothesis}</CardBody>
              </Card>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Broker" value={strategy.broker ?? "—"} hint={strategy.environment ?? "—"} />
                <StatTile label="Posición actual" value={execution?.currentPosition.symbol ?? execution?.currentPosition.state ?? "—"} />
                <StatTile label="Salud" value={health ? <HealthBadge status={health.status} /> : "—"} />
                <StatTile label="Guards" value={safety ? <GuardOverall status={safety.overallStatus} /> : "—"} />
              </div>

              {signal ? <SignalCard signal={signal} /> : null}
            </div>
          ),

          performance: (
            <div className="space-y-6">
              {disclaimer}
              {strategy.performance?.historical ? (
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
                  </CardBody>
                </Card>
              ) : null}
              {risk ? <ForwardPerformancePanel forwardMetrics={risk.forwardMetrics} /> : null}
            </div>
          ),

          positions: (
            <div className="space-y-6">
              <Card>
                <CardHeader title="Posiciones abiertas" description={portfolio?.available ? `Lectura en vivo${portfolio.lastSyncedAt ? ` · ${formatFreshness(portfolio.lastSyncedAt)}` : ""}` : undefined} />
                <CardBody className="p-4">
                  {portfolio?.available ? (
                    positions.length > 0 ? (
                      <div className="space-y-2">
                        {positions.map((p) => (
                          <div key={p.symbol} className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-sm">
                            <div>
                              <p className="font-mono text-foreground">{p.symbol}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.qty} sh @ ${p.avgEntryPrice.toFixed(2)} avg
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-foreground">${p.marketValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                              <p className={`text-xs ${p.unrealizedPl >= 0 ? "text-buy" : "text-sell"}`}>
                                {p.unrealizedPl >= 0 ? "+" : ""}
                                {p.unrealizedPl.toFixed(2)}
                                {p.unrealizedPlPct !== undefined ? ` (${p.unrealizedPlPct >= 0 ? "+" : ""}${p.unrealizedPlPct.toFixed(2)}%)` : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState variant="zero" message="Sin posiciones abiertas." />
                    )
                  ) : (
                    <EmptyState variant="notConnected" message="Cuenta PAPER no disponible en este entorno." detail={portfolio?.unavailableReason} />
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Órdenes recientes" />
                <CardBody className="p-4">
                  {portfolio?.available ? (
                    orders.length > 0 ? (
                      <div className="space-y-2">
                        {orders.map((o) => (
                          <div key={o.orderId} className="flex items-center justify-between border-b border-border-subtle pb-2 text-sm last:border-0">
                            <div>
                              <p className="text-foreground">
                                {o.side.toUpperCase()} {o.symbol}
                              </p>
                              <p className="text-xs text-muted-foreground">{formatFreshness(o.submittedAt)}</p>
                            </div>
                            <span className="rounded-full border border-border-subtle px-2 py-0.5 text-xs text-muted">{o.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState variant="zero" message="Sin órdenes registradas." />
                    )
                  ) : (
                    <EmptyState variant="notConnected" message="Cuenta PAPER no disponible en este entorno." detail={portfolio?.unavailableReason} />
                  )}
                </CardBody>
              </Card>
            </div>
          ),

          signal: (
            <div className="space-y-6">
              {signal ? <SignalCard signal={signal} /> : <EmptyState variant="noData" message="Sin señal disponible." />}
              {safety ? <ExecutionSafetyPanel safety={safety} /> : null}
            </div>
          ),

          risk: (
            <div className="space-y-6">
              {disclaimer}
              {risk ? (
                <>
                  <Card>
                    <CardHeader title="Drawdown y volatilidad histórica" description={risk.strategyMetrics.sourceDoc} action={<MetricScopeBadge scope="BACKTEST" />} />
                    <CardBody className="grid grid-cols-2 gap-3 p-4">
                      <StatTile label="MaxDD histórico" value={`${risk.strategyMetrics.maxDrawdownPct.toFixed(2)}%`} />
                      <StatTile label="Volatilidad" value={`${risk.strategyMetrics.volatilityPct.toFixed(2)}%`} />
                      <StatTile label="Sharpe" value={risk.strategyMetrics.sharpe.toFixed(2)} />
                      <StatTile label="Calmar" value={risk.strategyMetrics.calmar.toFixed(2)} />
                    </CardBody>
                  </Card>
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
                  <Card>
                    <CardHeader title="Riesgo de ejecución" />
                    <CardBody className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                      <StatTile label="Órdenes enviadas" value={risk.executionMetrics.ordersSubmitted} />
                      <StatTile label="Órdenes rechazadas" value={risk.executionMetrics.ordersRejected} />
                      <StatTile label="Fills parciales" value={risk.executionMetrics.ordersPartialFill} />
                      <StatTile label="Errores" value={risk.executionMetrics.executionErrors} />
                    </CardBody>
                  </Card>
                </>
              ) : null}
            </div>
          ),

          activity: (
            <Card>
              <CardBody className="space-y-3 p-4">
                {activity.length === 0 ? (
                  <EmptyState variant="zero" message="Todavía no hay eventos registrados para este bot." />
                ) : (
                  activity.map((event) => (
                    <div key={event.id} className="border-b border-border-subtle pb-2 last:border-0 last:pb-0">
                      <p className="text-xs text-muted-foreground">{formatFreshness(event.timestamp)}</p>
                      <p className="text-sm text-foreground">{event.summary}</p>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          ),
        }}
      />

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

function GuardOverall({ status }: { status: "PASS" | "BLOCKED" | "AWAITING_APPROVAL" | "UNAVAILABLE" }) {
  const color = status === "PASS" ? "text-buy" : status === "BLOCKED" ? "text-sell" : status === "AWAITING_APPROVAL" ? "text-wait" : "text-muted";
  return <span className={`text-sm font-semibold ${color}`}>{status.replace(/_/g, " ")}</span>;
}
