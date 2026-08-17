import { StatTile } from "@/components/dashboard/StatTile";
import { SampleQualityBadge } from "@/components/backtesting/SampleQualityBadge";
import type { BacktestMetrics } from "@/core/backtesting/types";

interface MetricsSummaryGridProps {
  metrics: BacktestMetrics;
}

function pct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function money(value: number): string {
  return `${value >= 0 ? "+" : ""}$${value.toFixed(2)}`;
}

function r(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`;
}

/**
 * The primary results summary (point 12/13) — expectancy shown in both
 * $ and R, and win rate is never presented alone (profit factor and
 * expectancy sit right beside it, point 13).
 */
export function MetricsSummaryGrid({ metrics }: MetricsSummaryGridProps) {
  return (
    <div>
      <div className="mb-3">
        <SampleQualityBadge quality={metrics.sampleQuality} tradeCount={metrics.totalTrades} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Net P&L" value={money(metrics.netProfit)} />
        <StatTile label="Return" value={pct(metrics.returnPct)} />
        <StatTile label="Total trades" value={metrics.totalTrades} />
        <StatTile
          label="Win rate"
          value={`${(metrics.winRate * 100).toFixed(1)}%`}
          hint={`${metrics.winningTrades}W / ${metrics.losingTrades}L`}
        />
        <StatTile label="Profit factor" value={metrics.profitFactor.toFixed(2)} />
        <StatTile
          label="Expectancy"
          value={money(metrics.expectancy)}
          hint={r(metrics.expectancyR)}
        />
        <StatTile label="Average R" value={r(metrics.averageR)} hint={`median ${r(metrics.medianR)}`} />
        <StatTile
          label="Max drawdown"
          value={pct(-Math.abs(metrics.maxDrawdownPct))}
          hint={`$${metrics.maxDrawdownAmount.toFixed(2)}`}
        />
        <StatTile label="Sharpe" value={metrics.sharpeRatio?.toFixed(2) ?? "—"} />
        <StatTile label="Sortino" value={metrics.sortinoRatio?.toFixed(2) ?? "—"} />
        <StatTile
          label="Consecutive W/L"
          value={`${metrics.consecutiveWins} / ${metrics.consecutiveLosses}`}
        />
        <StatTile label="Exposure" value={`${metrics.exposurePct.toFixed(1)}%`} />
        <StatTile label="Trades / month" value={metrics.tradesPerMonth.toFixed(1)} />
        <StatTile
          label="Avg holding time"
          value={`${(metrics.averageHoldingTimeMs / 3_600_000).toFixed(1)}h`}
        />
      </div>
    </div>
  );
}
