import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { ForwardPerformancePanel } from "@/components/novacore/ForwardPerformancePanel";
import { SpyBenchmarkChart } from "@/components/novacore/SpyBenchmarkChart";
import { MetricScopeBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { getRs3mRiskSnapshot } from "@/novacore/risk-analytics/adapters/rs3m-risk-adapter";

export default async function NovaCoreRiskPage() {
  const risk = await getRs3mRiskSnapshot();

  return (
    <div>
      <PageHeader title="Riesgo y Analítica" description="Métricas de riesgo de estrategia, ejecución y forward. Sin allocator automático — solo lectura." />

      <div className="mb-6 rounded-xl border border-wait/30 bg-wait/5 px-4 py-3 text-xs text-wait">
        <strong>HISTORICAL BACKTEST ≠ FORWARD PAPER RESULTS.</strong> El CAGR histórico (17.24%) es un resultado de backtest 2016-2026, no lo que NovaCore está ganando ahora mismo. El rendimiento forward real (si existe) se muestra por separado, más abajo.
      </div>

      <div className="mb-6">
        <Card>
          <CardBody className="p-4">
            <SpyBenchmarkChart />
          </CardBody>
        </Card>
      </div>

      <div className="mb-6">
        <ForwardPerformancePanel forwardMetrics={risk.forwardMetrics} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Drawdown y retorno histórico" description={risk.strategyMetrics.sourceDoc} action={<MetricScopeBadge scope="BACKTEST" />} />
          <CardBody className="grid grid-cols-2 gap-3 p-4">
            <StatTile label="MaxDD histórico completo" value={`${risk.strategyMetrics.maxDrawdownPct.toFixed(2)}%`} />
            <StatTile label="Volatilidad (anualizada)" value={`${risk.strategyMetrics.volatilityPct.toFixed(2)}%`} />
            <StatTile label="Sharpe" value={risk.strategyMetrics.sharpe.toFixed(2)} />
            <StatTile label="Calmar" value={risk.strategyMetrics.calmar.toFixed(2)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Hallazgo out-of-sample" description={`${risk.oosMetrics.periodLabel} · ${risk.oosMetrics.sourceDoc}`} action={<MetricScopeBadge scope="OOS" />} />
          <CardBody className="p-4">
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Exceso vs. SPY" value={`${risk.oosMetrics.excessReturnVsSpyPct.toFixed(2)}pp`} valueClassName="text-sell" />
              <StatTile label="Captura de bajadas" value={`${risk.oosMetrics.downsideCapturePct.toFixed(1)}%`} valueClassName="text-sell" />
              <StatTile label="Captura de subidas" value={`${risk.oosMetrics.upsideCapturePct.toFixed(1)}%`} />
              <StatTile label="Information ratio" value={risk.oosMetrics.informationRatio.toFixed(2)} valueClassName="text-sell" />
            </div>
            <p className="mt-4 text-xs text-muted">{risk.oosMetrics.note}</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Riesgo de ejecución" description="Salud de la ejecución en el broker para RS3M." />
          <CardBody className="grid grid-cols-2 gap-3 p-4">
            <StatTile label="Órdenes enviadas" value={risk.executionMetrics.ordersSubmitted} />
            <StatTile label="Órdenes rechazadas" value={risk.executionMetrics.ordersRejected} />
            <StatTile label="Fills parciales" value={risk.executionMetrics.ordersPartialFill} />
            <StatTile label="Errores de ejecución" value={risk.executionMetrics.executionErrors} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Robustez frente a costes" description={risk.costRobustness.sourceDoc} action={<MetricScopeBadge scope="BACKTEST" />} />
          <CardBody className="grid grid-cols-2 gap-3 p-4">
            <StatTile label="Coste de referencia" value={`${risk.costRobustness.referenceRebalanceCostBps} bps`} />
            <StatTile label="Coste de break-even" value={`${risk.costRobustness.breakEvenCostBps.toFixed(1)} bps`} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
