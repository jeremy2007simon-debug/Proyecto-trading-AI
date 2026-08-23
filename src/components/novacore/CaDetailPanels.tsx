import { StatTile } from "@/components/dashboard/StatTile";
import { BotDetailTabs } from "@/components/novacore/BotDetailTabs";
import { EmptyState } from "@/components/novacore/EmptyState";
import { MetricScopeBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatFreshness } from "@/lib/format-freshness";
import type { NovaCoreStrategy } from "@/novacore/shared/types";
import type { NovaCoreEvent } from "@/novacore/events/types";
import type { CaShadowSnapshot } from "@/novacore/strategy-hub/adapters/ca-shadow-snapshot-adapter";
import type { CaOosMetrics, CaCostRobustness, CaRs3mCorrelation } from "@/novacore/risk-analytics/adapters/ca-historical-metrics";

const CA_TABS = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Rendimiento" },
  { id: "signal", label: "Señal" },
  { id: "shadow", label: "Shadow" },
  { id: "risk", label: "Riesgo" },
  { id: "activity", label: "Actividad" },
];

/**
 * Block 10 §5 — C-A's own 6-tab panel set, rendered through the SAME
 * `BotDetailTabs` component RS3M uses (generalized to accept a custom
 * `tabs` list) — not a second, parallel tab UI (§28).
 */
export function CaDetailPanels({
  strategy,
  shadow,
  activity,
  oos,
  cost,
  correlation,
}: {
  strategy: NovaCoreStrategy;
  shadow: CaShadowSnapshot;
  activity: NovaCoreEvent[];
  oos: CaOosMetrics;
  cost: CaCostRobustness;
  correlation: CaRs3mCorrelation;
}) {
  const h = strategy.performance?.historical;

  return (
    <BotDetailTabs
      tabs={CA_TABS}
      panels={{
        overview: (
          <div className="space-y-6">
            <Card>
              <CardHeader title="Hipótesis" />
              <CardBody className="p-4 text-sm text-muted">{strategy.hypothesis}</CardBody>
            </Card>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Spec hash" value={strategy.candidateHash ?? "n/d"} />
              <StatTile label="Mercado" value="SPY (SP500)" />
              <StatTile label="Timeframe" value="1D" />
              <StatTile label="Verificación" value="VERIFIED (Block 9.y)" />
            </div>
            {h ? (
              <Card>
                <CardHeader title="Métricas históricas" description={`${h.periodStart} → ${h.periodEnd} · ${h.sourceDoc}`} action={<MetricScopeBadge scope="BACKTEST" />} />
                <CardBody className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                  <StatTile label="Retorno total" value={`${h.totalReturnPct.toFixed(2)}%`} />
                  <StatTile label="CAGR" value={`${h.cagrPct.toFixed(2)}%`} />
                  <StatTile label="MaxDD" value={`${h.maxDrawdownPct.toFixed(2)}%`} />
                  <StatTile label="Sharpe" value={h.sharpe?.toFixed(3) ?? "—"} />
                </CardBody>
              </Card>
            ) : null}
          </div>
        ),

        performance: (
          <div className="space-y-6">
            {h ? (
              <Card>
                <CardHeader title="Rendimiento histórico (backtest)" description={h.sourceDoc} action={<MetricScopeBadge scope="BACKTEST" />} />
                <CardBody className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                  <StatTile label="Net CAGR" value={`${h.cagrPct.toFixed(2)}%`} />
                  <StatTile label="MaxDD" value={`${h.maxDrawdownPct.toFixed(2)}%`} />
                  <StatTile label="Sharpe" value={h.sharpe?.toFixed(3) ?? "—"} />
                  <StatTile label="Break-even cost" value={`${cost.breakEvenCostBps.toFixed(1)}bps`} hint={`ref. ${cost.referenceRebalanceCostBps}bps`} />
                </CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader title="OOS / Walk-forward" description={oos.sourceDoc} action={<MetricScopeBadge scope="OOS" />} />
              <CardBody className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                <StatTile label="OOS retorno" value={`${oos.oosTotalReturnPct.toFixed(1)}%`} hint={`${oos.oosMonths} meses`} />
                <StatTile label="Rolling OOS positivo" value={`${oos.rollingOosPositivePct.toFixed(0)}%`} hint={`${oos.rollingOosWindows} ventanas`} />
                <StatTile label="Walk-forward positivo" value={`${oos.walkForwardPositivePct.toFixed(1)}%`} hint={`${oos.walkForwardWindows} ventanas`} />
                <StatTile label="Peor ventana WF" value={`${oos.walkForwardWorstPct.toFixed(1)}%`} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Correlación con RS3M" description={correlation.sourceDoc} />
              <CardBody className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                <StatTile label="Correlación retornos" value={correlation.returnCorrelation.toFixed(3)} />
                <StatTile label="Correlación drawdown" value={correlation.drawdownCorrelation.toFixed(3)} />
                <StatTile label="Solape de exposición" value={`${correlation.exposureOverlapPct.toFixed(1)}%`} />
                <StatTile label="Corr. en crisis" value={correlation.crisisQuartileCorrelation.toFixed(3)} />
              </CardBody>
            </Card>
          </div>
        ),

        signal: (
          <div className="space-y-6">
            <Card>
              <CardHeader title="Señal canónica actual" description={shadow.latestSignal ? `Fuente: ${shadow.latestSignal.dataSource}` : undefined} />
              <CardBody className="p-4">
                {shadow.latestSignal ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <StatTile label="Última fecha evaluada" value={shadow.latestSignal.evaluatedDate} />
                    <StatTile label="Percentile rank" value={shadow.latestSignal.percentileRank.toFixed(3)} />
                    <StatTile label="Umbral de disparo" value={shadow.latestSignal.percentileThreshold.toFixed(4)} />
                    <StatTile label="Retorno evaluado" value={`${(shadow.latestSignal.decisionReturn * 100).toFixed(2)}%`} />
                    <StatTile label="Señal actual" value={shadow.latestSignal.triggered ? "TRIGGERED" : "SIN DISPARO"} valueClassName={shadow.latestSignal.triggered ? "text-buy" : undefined} />
                    <StatTile label="Posición hipotética" value={shadow.shadow.currentPosition} />
                    <StatTile label="Frescura" value={formatFreshness(shadow.latestSignal.dataCutoff)} />
                  </div>
                ) : (
                  <EmptyState variant="noData" message="Sin señal SHADOW todavía." detail="El Routine de shadow de C-A no ha corrido en este entorno." />
                )}
              </CardBody>
            </Card>
          </div>
        ),

        shadow: (
          <div className="space-y-6">
            <div className="rounded-xl border border-purple-400/30 bg-purple-400/5 px-4 py-3 text-xs text-purple-400">
              Todo lo que sigue es evidencia forward SHADOW — hipotética, calculada por NovaCore. Cero órdenes reales.
            </div>
            <Card>
              <CardHeader title="Estado del forward SHADOW" description={`Inicio del forward: ${shadow.shadow.forwardStartTimestamp.slice(0, 10)}`} />
              <CardBody className="p-4">
                {shadow.hasForwardEvidence ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatTile label="Días procesados" value={shadow.shadow.daysProcessed} />
                    <StatTile label="Trades" value={shadow.shadow.trades} />
                    <StatTile label="Bloqueados" value={shadow.shadow.blockedDays} />
                    <StatTile label="Posición actual" value={shadow.shadow.currentPosition} />
                    <StatTile label="Equity hipotético" value={shadow.shadow.hypotheticalEquity.toFixed(6)} />
                    <StatTile
                      label="P&amp;L shadow realizado"
                      value={`${shadow.shadow.realizedShadowPnlPct >= 0 ? "+" : ""}${shadow.shadow.realizedShadowPnlPct.toFixed(2)}%`}
                      valueClassName={shadow.shadow.realizedShadowPnlPct >= 0 ? "text-buy" : "text-sell"}
                    />
                    <StatTile label="SPY benchmark (mismo período)" value={shadow.shadow.spyBenchmarkReturnPct !== undefined ? `${shadow.shadow.spyBenchmarkReturnPct >= 0 ? "+" : ""}${shadow.shadow.spyBenchmarkReturnPct.toFixed(2)}%` : "—"} />
                    <StatTile label="Último evento" value={shadow.shadow.lastEventDate ?? "—"} />
                  </div>
                ) : (
                  <EmptyState variant="noData" message="INSUFFICIENT FORWARD DATA." detail="Sin evidencia forward SHADOW todavía en este entorno — el Routine diario de C-A no ha corrido." />
                )}
              </CardBody>
            </Card>
            {shadow.shadow.lastFill ? (
              <Card>
                <CardHeader title="Último fill hipotético" />
                <CardBody className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                  <StatTile label="Fecha" value={shadow.shadow.lastFill.date} />
                  <StatTile label="Decisión" value={shadow.shadow.lastFill.decision} />
                  <StatTile label="Precio hipotético" value={`$${shadow.shadow.lastFill.price.toFixed(2)}`} />
                  <StatTile label="Costo asumido" value={`${shadow.shadow.lastFill.costBps}bps`} />
                </CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader title="Promotion bar (Paper)" description="Criterios definidos ANTES de observar datos forward — nunca ajustados según el resultado (§22/§23)." />
              <CardBody className="space-y-4 p-4">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    OPERATIONAL_VERIFIED: <span className={shadow.promotionBar.operationalVerified ? "text-buy" : "text-wait"}>{shadow.promotionBar.operationalVerified ? "SÍ" : "TODAVÍA NO"}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Verifica que el pipeline funciona correctamente — NO mide rentabilidad.</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <StatTile label="Días procesados" value={shadow.promotionBar.operational.tradingDaysProcessed} />
                    <StatTile label="Hash/adjustment OK" value={shadow.promotionBar.operational.hasCandidateHashOrAdjustmentMismatch ? "NO" : "SÍ"} />
                    <StatTile label="Racha DATA_STALE" value={shadow.promotionBar.operational.longestConsecutiveDataStaleStreak} />
                    <StatTile label="Costo consistente" value={shadow.promotionBar.operational.costBpsConsistent ? "SÍ" : "NO"} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    FORWARD_EVIDENCE_SUFFICIENT: <span className={shadow.promotionBar.forwardEvidenceSufficient ? "text-buy" : "text-wait"}>{shadow.promotionBar.forwardEvidenceSufficient ? "SÍ" : "TODAVÍA NO"}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Suficiente tiempo y trades para decir algo estadísticamente significativo — NO un umbral de retorno.</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <StatTile label="Días calendario desde inicio" value={Math.floor(shadow.promotionBar.forwardEvidence.calendarDaysSinceForwardStart)} />
                    <StatTile label="Trades completados" value={shadow.promotionBar.forwardEvidence.completedTrades} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Ambos criterios en verdadero solo hace a C-A ELEGIBLE para una futura decisión de Paper — nunca la ejecuta automáticamente. No existe conexión a Paper para C-A en este código (§25).</p>
              </CardBody>
            </Card>
          </div>
        ),

        risk: (
          <div className="space-y-6">
            <Card>
              <CardHeader title="Drawdown" />
              <CardBody className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                <StatTile label="DD actual (shadow)" value={shadow.risk.currentDrawdownPct !== undefined ? `${shadow.risk.currentDrawdownPct.toFixed(2)}%` : "Sin datos"} />
                <StatTile label="MaxDD histórico" value={`${shadow.risk.historicalMaxDrawdownPct.toFixed(2)}%`} />
                <StatTile label="Rolling OOS positivo" value={`${shadow.risk.rollingOosPositivePct.toFixed(0)}%`} />
                <StatTile label="Walk-forward positivo" value={`${shadow.risk.walkForwardPositivePct.toFixed(1)}%`} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Correlación con RS3M" />
              <CardBody className="grid grid-cols-2 gap-3 p-4">
                <StatTile label="Correlación retornos" value={shadow.risk.correlationVsRs3m.toFixed(3)} />
                <StatTile label="Correlación drawdown" value={shadow.risk.drawdownCorrelationVsRs3m.toFixed(3)} />
              </CardBody>
            </Card>
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
  );
}
