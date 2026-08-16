import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { LineChart, type LineChartPoint } from "@/components/backtesting/LineChart";
import type { BacktestTrade } from "@/core/backtesting/types";

interface CumulativeRChartProps {
  trades: BacktestTrade[];
}

function closedTradesByExit(trades: BacktestTrade[]): BacktestTrade[] {
  return trades
    .filter((t) => t.exitAt !== undefined && t.pnlR !== undefined)
    .slice()
    .sort((a, b) => new Date(a.exitAt!).getTime() - new Date(b.exitAt!).getTime());
}

/** Plain helper (not a component) — safe to accumulate with a local reducer, unlike doing so directly in render. */
function buildCumulativeRPoints(closed: BacktestTrade[]): LineChartPoint[] {
  return closed.reduce<LineChartPoint[]>(
    (points, trade) => [...points, { x: points.length, y: points[points.length - 1].y + trade.pnlR! }],
    [{ x: 0, y: 0 }],
  );
}

/** Cumulative sum of realized R-multiples — the cross-strategy-comparable view of the same equity curve (point 7/20). */
export function CumulativeRChart({ trades }: CumulativeRChartProps) {
  const points = buildCumulativeRPoints(closedTradesByExit(trades));

  return (
    <Card>
      <CardHeader title="Cumulative R" description="Running sum of realized R-multiples across trades." />
      <CardBody>
        <LineChart points={points} color="var(--buy)" referenceY={0} />
      </CardBody>
    </Card>
  );
}
