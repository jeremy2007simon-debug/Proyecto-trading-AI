import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { LineChart, type LineChartPoint } from "@/components/backtesting/LineChart";
import type { BacktestTrade } from "@/core/backtesting/types";

interface EquityCurveChartProps {
  trades: BacktestTrade[];
  initialCapital: number;
}

/** Sorts trades by exit time, ascending — the only order an equity/drawdown/R curve can honestly be drawn in. */
function closedTradesByExit(trades: BacktestTrade[]): BacktestTrade[] {
  return trades
    .filter((t) => t.exitAt !== undefined && t.pnlAmount !== undefined)
    .slice()
    .sort((a, b) => new Date(a.exitAt!).getTime() - new Date(b.exitAt!).getTime());
}

/** Plain helper (not a component) — safe to accumulate with a local reducer, unlike doing so directly in render. */
function buildEquityPoints(closed: BacktestTrade[], initialCapital: number): LineChartPoint[] {
  return closed.reduce<LineChartPoint[]>(
    (points, trade) => [...points, { x: points.length, y: points[points.length - 1].y + trade.pnlAmount! }],
    [{ x: 0, y: initialCapital }],
  );
}

export function EquityCurveChart({ trades, initialCapital }: EquityCurveChartProps) {
  const points = buildEquityPoints(closedTradesByExit(trades), initialCapital);

  return (
    <Card>
      <CardHeader title="Equity curve" description="Account equity after each closed trade, in order." />
      <CardBody>
        <LineChart points={points} color="var(--accent)" referenceY={initialCapital} />
      </CardBody>
    </Card>
  );
}
