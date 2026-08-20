import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { ExecutionSafetyPanel } from "@/components/novacore/ExecutionSafetyPanel";
import { SignalCard } from "@/components/novacore/SignalCard";
import { HealthBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { getRs3mExecutionSnapshot } from "@/novacore/execution-center/adapters/rs3m-execution-adapter";
import { getRs3mExecutionSafety } from "@/novacore/execution-center/adapters/rs3m-guards-adapter";
import { getNovaCorePortfolioSnapshot } from "@/novacore/portfolio/adapters/rs3m-portfolio-adapter";
import { getRs3mCurrentSignal } from "@/novacore/strategy-hub/adapters/rs3m-signal-adapter";

export default async function NovaCoreExecutionPage() {
  const [execution, portfolio, safety, signal] = await Promise.all([
    getRs3mExecutionSnapshot(),
    getNovaCorePortfolioSnapshot(),
    getRs3mExecutionSafety(),
    Promise.resolve(getRs3mCurrentSignal()),
  ]);

  return (
    <div>
      <PageHeader title="Execution Center" description="Broker, cuenta, posiciones, órdenes, aprobaciones, guards. Solo lectura / monitorización — sin controles que salten los safety guards existentes." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Broker" value={execution.broker} hint={execution.environment} />
        <StatTile label="Posición actual" value={execution.currentPosition.symbol ?? execution.currentPosition.state} hint={execution.currentPosition.provenance} />
        <StatTile label="Órdenes enviadas" value={execution.ordersSubmittedTotal} />
        <StatTile label="Aprobación" value={execution.approval.approvedForCurrentMonth ? "Aprobada" : execution.approval.awaitingApproval ? "Pendiente" : "Aún no requerida"} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SignalCard signal={signal} />

        <Card>
          <CardHeader title="RS3M_CANDIDATE_V1" description={`Hash del candidato ${execution.candidateHash}`} />
          <CardBody className="space-y-3 p-4 text-sm">
            <div className="flex justify-between"><span className="text-muted">Posición actual</span><span className="text-foreground">{execution.currentPosition.detail}</span></div>
            {execution.currentPosition.marketValue !== undefined ? (
              <div className="flex justify-between"><span className="text-muted">Market value</span><span className="font-mono text-foreground">${execution.currentPosition.marketValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
            ) : null}
            {execution.currentPosition.unrealizedPl !== undefined ? (
              <div className="flex justify-between">
                <span className="text-muted">Unrealized P&amp;L</span>
                <span className={`font-mono ${execution.currentPosition.unrealizedPl >= 0 ? "text-buy" : "text-sell"}`}>
                  ${execution.currentPosition.unrealizedPl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  {execution.currentPosition.unrealizedPlPct !== undefined ? ` (${execution.currentPosition.unrealizedPlPct.toFixed(2)}%)` : ""}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between"><span className="text-muted">Última señal conocida</span><span className="text-foreground">{execution.lastKnownSignal ? `${execution.lastKnownSignal.winner ?? "n/d"} (${execution.lastKnownSignal.decisionMonth})` : "Ninguna registrada todavía"}</span></div>
            <div className="flex justify-between"><span className="text-muted">Mes de decisión</span><span className="text-foreground">{execution.approval.currentDecisionMonth}</span></div>
            <div className="flex justify-between"><span className="text-muted">Modo de ejecución</span><span className="font-mono text-foreground">{execution.executionMode}</span></div>
            <div className="flex justify-between"><span className="text-muted">LIVE</span><span className="font-mono text-sell">{execution.liveStatus.replace(/_/g, " ")}</span></div>
            <div className="flex justify-between"><span className="text-muted">Routine</span><HealthBadge status={execution.routine.status} /></div>
            <p className="pt-2 text-xs text-muted-foreground">{execution.routine.detail}</p>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <ExecutionSafetyPanel safety={safety} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Cuenta PAPER de Alpaca"
            description={portfolio.available ? `Lectura en vivo${portfolio.lastSyncedAt ? ` · sincronizado ${new Date(portfolio.lastSyncedAt).toLocaleString("es-ES")}` : ""}` : "No disponible en este entorno"}
          />
          <CardBody className="p-4">
            {portfolio.available ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <StatTile label="Equity" value={`$${portfolio.totalEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
                  <StatTile label="Cash" value={`$${portfolio.totalCash.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
                  <StatTile label="Buying power" value={`$${portfolio.accounts[0]?.buyingPower.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}`} />
                </div>
                {portfolio.positions.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {portfolio.positions.map((p) => (
                      <div key={p.symbol} className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-sm">
                        <div>
                          <p className="font-mono text-foreground">{p.symbol}</p>
                          <p className="text-xs text-muted-foreground">{p.qty} sh @ ${p.avgEntryPrice.toFixed(2)} avg</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-foreground">${p.marketValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                          <p className={`text-xs ${p.unrealizedPl >= 0 ? "text-buy" : "text-sell"}`}>
                            {p.unrealizedPl >= 0 ? "+" : ""}${p.unrealizedPl.toFixed(2)}
                            {p.unrealizedPlPct !== undefined ? ` (${p.unrealizedPlPct >= 0 ? "+" : ""}${p.unrealizedPlPct.toFixed(2)}%)` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted">Sin posiciones abiertas.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">{portfolio.unavailableReason}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Órdenes recientes" description="Lectura en vivo de Alpaca — nunca puede enviar una orden desde aquí." />
          <CardBody className="p-4">
            {portfolio.available && portfolio.recentOrders.length > 0 ? (
              <div className="space-y-2">
                {portfolio.recentOrders.map((o) => (
                  <div key={o.orderId} className="flex items-center justify-between border-b border-border-subtle pb-2 text-sm last:border-0">
                    <div>
                      <p className="text-foreground">{o.side.toUpperCase()} {o.symbol}</p>
                      <p className="text-xs text-muted-foreground">{new Date(o.submittedAt).toLocaleString("es-ES")}</p>
                    </div>
                    <span className="rounded-full border border-border-subtle px-2 py-0.5 text-xs text-muted">{o.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">{portfolio.available ? "Sin órdenes registradas." : portfolio.unavailableReason}</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader title="Fuente de la verdad" />
          <CardBody className="space-y-1 p-4 text-xs">
            {Object.entries(execution.sourceOfTruth).map(([field, source]) => (
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
