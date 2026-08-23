import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { EmptyState } from "@/components/novacore/EmptyState";
import { MetricScopeBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { getRs3mRiskSnapshot } from "@/novacore/risk-analytics/adapters/rs3m-risk-adapter";
import { getCaShadowSnapshot, CA_RS3M_CORRELATION } from "@/novacore/strategy-hub/adapters/ca-shadow-snapshot-adapter";
import { CA_FULL_HISTORY_METRICS } from "@/novacore/risk-analytics/adapters/ca-historical-metrics";
import { RS3M_FULL_HISTORY_METRICS } from "@/novacore/risk-analytics/adapters/rs3m-historical-metrics";

/**
 * Block 10 §17 — Portfolio Lab / Strategy Comparison. Shows RS3M (PAPER)
 * next to C-A (SHADOW) — never combined as if they shared real money.
 * Once BOTH strategies have enough overlapping FORWARD evidence, this
 * page can additionally simulate a 50/50 forward portfolio, always
 * explicitly labeled "SIMULATED FORWARD PORTFOLIO" — until then it shows
 * an honest insufficient-data state, never a fabricated blend (§16).
 */

/** §23/§24 — a deliberately conservative floor before even ATTEMPTING a simulated blend: real overlapping days on BOTH sides, not "any data at all". */
const MIN_OVERLAPPING_FORWARD_DAYS_FOR_SIMULATION = 60;

export default async function PortfolioLabPage() {
  const [rs3mRisk, caShadow] = await Promise.all([getRs3mRiskSnapshot(), Promise.resolve(getCaShadowSnapshot())]);

  const rs3mForwardAvailable = rs3mRisk.forwardMetrics.available;
  const caForwardAvailable = caShadow.hasForwardEvidence;
  const overlappingDays = caForwardAvailable ? caShadow.shadow.daysProcessed : 0; // conservative proxy — real overlap needs RS3M forward days too, itself 0 here
  const canSimulate = rs3mForwardAvailable && caForwardAvailable && overlappingDays >= MIN_OVERLAPPING_FORWARD_DAYS_FOR_SIMULATION;

  return (
    <div>
      <PageHeader title="Portfolio Lab" description="RS3M (Paper) vs. C-A (Shadow) — nunca combinados como si compartieran capital real." />

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card className="border-accent/20">
            <CardHeader title="RS3M — PAPER" action={<MetricScopeBadge scope="FORWARD_PAPER" />} />
            <CardBody className="grid grid-cols-2 gap-3 p-4">
              <StatTile label="Retorno histórico" value={`${RS3M_FULL_HISTORY_METRICS.totalReturnPct.toFixed(1)}%`} hint="backtest" />
              <StatTile label="MaxDD histórico" value={`${RS3M_FULL_HISTORY_METRICS.maxDrawdownPct.toFixed(2)}%`} hint="backtest" />
              <StatTile
                label="Retorno forward"
                value={rs3mForwardAvailable ? `${(rs3mRisk.forwardMetrics.totalReturnPct ?? 0) >= 0 ? "+" : ""}${(rs3mRisk.forwardMetrics.totalReturnPct ?? 0).toFixed(2)}%` : "Sin datos"}
              />
              <StatTile label="DD actual forward" value={rs3mForwardAvailable && rs3mRisk.forwardMetrics.currentDrawdownPct !== undefined ? `${rs3mRisk.forwardMetrics.currentDrawdownPct.toFixed(2)}%` : "Sin datos"} />
            </CardBody>
          </Card>

          <Card className="border-purple-400/20">
            <CardHeader title="C-A — SHADOW" action={<span className="rounded-full border border-purple-400/30 bg-purple-400/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-purple-400">SHADOW FORWARD</span>} />
            <CardBody className="grid grid-cols-2 gap-3 p-4">
              <StatTile label="Retorno histórico" value={`${CA_FULL_HISTORY_METRICS.totalReturnPct.toFixed(1)}%`} hint="backtest" />
              <StatTile label="MaxDD histórico" value={`${CA_FULL_HISTORY_METRICS.maxDrawdownPct.toFixed(2)}%`} hint="backtest" />
              <StatTile label="P&amp;L shadow" value={caForwardAvailable ? `${caShadow.shadow.realizedShadowPnlPct >= 0 ? "+" : ""}${caShadow.shadow.realizedShadowPnlPct.toFixed(2)}%` : "Sin datos"} />
              <StatTile label="DD actual shadow" value={caForwardAvailable && caShadow.risk.currentDrawdownPct !== undefined ? `${caShadow.risk.currentDrawdownPct.toFixed(2)}%` : "Sin datos"} />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Comparación" description="Retorno, drawdown, correlación, solape de señal." />
          <CardBody className="p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Correlación de retornos (backtest)" value={CA_RS3M_CORRELATION.returnCorrelation.toFixed(3)} />
              <StatTile label="Correlación de drawdown (backtest)" value={CA_RS3M_CORRELATION.drawdownCorrelation.toFixed(3)} />
              <StatTile label="Solape de exposición (backtest)" value={`${CA_RS3M_CORRELATION.exposureOverlapPct.toFixed(1)}%`} />
              <StatTile label="Correlación forward" value={rs3mForwardAvailable && caForwardAvailable ? "—" : "Sin datos forward suficientes"} />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Las cifras de correlación forward requieren evidencia forward REAL de ambas estrategias simultáneamente — RS3M Paper y C-A Shadow. Hasta entonces solo se muestra la correlación de backtest ({CA_RS3M_CORRELATION.sourceDoc}).
            </p>
          </CardBody>
        </Card>

        <Card className={canSimulate ? "border-accent/30" : undefined}>
          <CardHeader title="SIMULATED FORWARD PORTFOLIO (50/50)" description="Nunca mueve capital real — un blend hipotético calculado por NovaCore para comparar." />
          <CardBody className="p-4">
            {canSimulate ? (
              <EmptyState variant="noData" message="Simulación disponible (placeholder)." detail="El cálculo del blend 50/50 se activa una vez que ambos lados tienen suficiente evidencia forward superpuesta." />
            ) : (
              <EmptyState
                variant="noData"
                message="INSUFFICIENT FORWARD DATA"
                detail={`Se requieren al menos ${MIN_OVERLAPPING_FORWARD_DAYS_FOR_SIMULATION} días forward superpuestos de RS3M (Paper) Y C-A (Shadow) antes de simular un blend 50/50. RS3M forward disponible: ${rs3mForwardAvailable ? "sí" : "no"}. C-A shadow disponible: ${caForwardAvailable ? "sí" : "no"}.`}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
