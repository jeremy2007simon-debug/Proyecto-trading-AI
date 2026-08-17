import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { BacktestMetrics } from "@/core/backtesting/types";

interface BuyHoldComparisonProps {
  strategyMetrics: BacktestMetrics;
  baseline: BacktestMetrics;
}

/**
 * Buy & Hold SPY over the identical period, shown for context (point
 * 25) — explicitly NOT a like-for-like comparison. The baseline has no
 * stop, no risk management, and is exposed 100% of the time, so only
 * net P&L / return% / max drawdown% are placed side by side; win rate,
 * R-based figures, and profit factor are meaningless for a single
 * conceptual trade and are intentionally omitted here.
 */
export function BuyHoldComparison({ strategyMetrics, baseline }: BuyHoldComparisonProps) {
  return (
    <Card>
      <CardHeader
        title="Vs. Buy & Hold"
        description="Same period, same instrument — not a like-for-like comparison (no risk management, always exposed). See note below."
      />
      <CardBody className="overflow-x-auto p-0">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs text-muted">
              <th className="px-5 py-3 font-medium"> </th>
              <th className="px-5 py-3 font-medium">Net P&L</th>
              <th className="px-5 py-3 font-medium">Return</th>
              <th className="px-5 py-3 font-medium">Max drawdown</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border-subtle">
              <td className="px-5 py-2.5 font-medium text-foreground">Strategy</td>
              <td className="px-5 py-2.5 tabular-nums text-foreground">
                ${strategyMetrics.netProfit.toFixed(2)}
              </td>
              <td className="px-5 py-2.5 tabular-nums text-foreground">
                {strategyMetrics.returnPct.toFixed(2)}%
              </td>
              <td className="px-5 py-2.5 tabular-nums text-foreground">
                {strategyMetrics.maxDrawdownPct.toFixed(2)}%
              </td>
            </tr>
            <tr>
              <td className="px-5 py-2.5 font-medium text-foreground">Buy &amp; Hold</td>
              <td className="px-5 py-2.5 tabular-nums text-muted">${baseline.netProfit.toFixed(2)}</td>
              <td className="px-5 py-2.5 tabular-nums text-muted">{baseline.returnPct.toFixed(2)}%</td>
              <td className="px-5 py-2.5 tabular-nums text-muted">{baseline.maxDrawdownPct.toFixed(2)}%</td>
            </tr>
          </tbody>
        </table>
        <p className="px-5 py-3 text-xs text-muted-foreground">
          Buy &amp; Hold is one conceptual trade (buy at the first candle, hold to the last) with no defined
          risk — its win rate, R-multiples, and profit factor are not comparable to the strategy&apos;s and are
          omitted rather than shown misleadingly.
        </p>
      </CardBody>
    </Card>
  );
}
