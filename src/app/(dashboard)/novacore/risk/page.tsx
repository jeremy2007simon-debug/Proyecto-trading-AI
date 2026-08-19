import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { getRs3mRiskSnapshot } from "@/novacore/risk-analytics/adapters/rs3m-risk-adapter";

export default function NovaCoreRiskPage() {
  const risk = getRs3mRiskSnapshot();

  return (
    <div>
      <PageHeader title="Risk & Analytics" description="Strategy, execution, and forward risk metrics. No automatic allocator — read only." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Historical drawdown & return" description={risk.strategyMetrics.sourceDoc} />
          <CardBody className="grid grid-cols-2 gap-3 p-4">
            <StatTile label="Full-history MaxDD" value={`${risk.strategyMetrics.maxDrawdownPct.toFixed(2)}%`} />
            <StatTile label="Volatility (annualized)" value={`${risk.strategyMetrics.volatilityPct.toFixed(2)}%`} />
            <StatTile label="Sharpe" value={risk.strategyMetrics.sharpe.toFixed(2)} />
            <StatTile label="Calmar" value={risk.strategyMetrics.calmar.toFixed(2)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Forward (paper) risk" description="Computed only from real, persisted forward evidence — never a live-refreshed backtest." />
          <CardBody className="p-4">
            {risk.forwardMetrics.available ? (
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Months observed" value={risk.forwardMetrics.monthsObserved} />
                <StatTile label="Forward MaxDD" value={`${risk.forwardMetrics.maxDrawdownPct.toFixed(2)}%`} />
                <StatTile label="Forward CAGR" value={risk.forwardMetrics.cagrPct !== undefined ? `${risk.forwardMetrics.cagrPct.toFixed(2)}%` : "—"} />
                <StatTile label="Excess vs SPY" value={risk.forwardMetrics.excessReturnVsSpyPct !== undefined ? `${risk.forwardMetrics.excessReturnVsSpyPct.toFixed(2)}pp` : "—"} />
              </div>
            ) : (
              <p className="text-sm text-muted">{risk.forwardMetrics.reason}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Out-of-sample finding" description={`${risk.oosMetrics.periodLabel} · ${risk.oosMetrics.sourceDoc}`} />
          <CardBody className="p-4">
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Excess vs SPY" value={`${risk.oosMetrics.excessReturnVsSpyPct.toFixed(2)}pp`} valueClassName="text-sell" />
              <StatTile label="Downside capture" value={`${risk.oosMetrics.downsideCapturePct.toFixed(1)}%`} valueClassName="text-sell" />
              <StatTile label="Upside capture" value={`${risk.oosMetrics.upsideCapturePct.toFixed(1)}%`} />
              <StatTile label="Information ratio" value={risk.oosMetrics.informationRatio.toFixed(2)} valueClassName="text-sell" />
            </div>
            <p className="mt-4 text-xs text-muted">{risk.oosMetrics.note}</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Execution risk" description="Broker-side execution health for RS3M." />
          <CardBody className="grid grid-cols-2 gap-3 p-4">
            <StatTile label="Orders submitted" value={risk.executionMetrics.ordersSubmitted} />
            <StatTile label="Orders rejected" value={risk.executionMetrics.ordersRejected} />
            <StatTile label="Partial fills" value={risk.executionMetrics.ordersPartialFill} />
            <StatTile label="Execution errors" value={risk.executionMetrics.executionErrors} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader title="Cost robustness" description={risk.costRobustness.sourceDoc} />
          <CardBody className="grid grid-cols-2 gap-3 p-4">
            <StatTile label="Reference cost" value={`${risk.costRobustness.referenceRebalanceCostBps} bps`} />
            <StatTile label="Break-even cost" value={`${risk.costRobustness.breakEvenCostBps.toFixed(1)} bps`} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
