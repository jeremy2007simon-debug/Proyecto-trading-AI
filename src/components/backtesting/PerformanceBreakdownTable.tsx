import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SampleQualityBadge } from "@/components/backtesting/SampleQualityBadge";
import type { BacktestMetrics } from "@/core/backtesting/types";

export interface PerformanceBreakdownEntry {
  label: string;
  metrics: BacktestMetrics;
}

interface PerformanceBreakdownTableProps {
  title: string;
  description: string;
  entries: PerformanceBreakdownEntry[];
}

/**
 * Generic breakdown table reused for performance-by-regime, -hour,
 * -weekday, -month, and -session (points 14/15/16). Rows are never
 * filtered or hidden for looking bad — every bucket the underlying
 * metrics object produced is shown, sample size included.
 */
export function PerformanceBreakdownTable({ title, description, entries }: PerformanceBreakdownTableProps) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="overflow-x-auto p-0">
        {entries.length > 0 ? (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs text-muted">
                <th className="px-5 py-3 font-medium">Bucket</th>
                <th className="px-5 py-3 font-medium">Trades</th>
                <th className="px-5 py-3 font-medium">Win rate</th>
                <th className="px-5 py-3 font-medium">Avg R</th>
                <th className="px-5 py-3 font-medium">Expectancy R</th>
                <th className="px-5 py-3 font-medium">Profit factor</th>
                <th className="px-5 py-3 font-medium">Max DD</th>
                <th className="px-5 py-3 font-medium">Sample</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ label, metrics }) => (
                <tr key={label} className="border-b border-border-subtle last:border-0">
                  <td className="px-5 py-2.5 font-medium text-foreground">{label}</td>
                  <td className="px-5 py-2.5 tabular-nums text-foreground">{metrics.totalTrades}</td>
                  <td className="px-5 py-2.5 tabular-nums text-muted">
                    {(metrics.winRate * 100).toFixed(1)}%
                  </td>
                  <td className="px-5 py-2.5 tabular-nums text-muted">{metrics.averageR.toFixed(2)}R</td>
                  <td className="px-5 py-2.5 tabular-nums text-muted">{metrics.expectancyR.toFixed(2)}R</td>
                  <td className="px-5 py-2.5 tabular-nums text-muted">{metrics.profitFactor.toFixed(2)}</td>
                  <td className="px-5 py-2.5 tabular-nums text-muted">
                    {metrics.maxDrawdownPct.toFixed(1)}%
                  </td>
                  <td className="px-5 py-2.5">
                    <SampleQualityBadge quality={metrics.sampleQuality} tradeCount={metrics.totalTrades} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-6 text-sm text-muted">No trades to break down.</p>
        )}
      </CardBody>
    </Card>
  );
}
