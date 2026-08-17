import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { LineChart, type LineChartPoint } from "@/components/backtesting/LineChart";
import type { BacktestTrade } from "@/core/backtesting/types";

interface DrawdownCurveChartProps {
  trades: BacktestTrade[];
  initialCapital: number;
}

function closedTradesByExit(trades: BacktestTrade[]): BacktestTrade[] {
  return trades
    .filter((t) => t.exitAt !== undefined && t.pnlAmount !== undefined)
    .slice()
    .sort((a, b) => new Date(a.exitAt!).getTime() - new Date(b.exitAt!).getTime());
}

interface DrawdownAccumulator {
  points: LineChartPoint[];
  equity: number;
  peak: number;
}

/** Plain helper (not a component) — safe to accumulate with a local reducer, unlike doing so directly in render. */
function buildDrawdownPoints(closed: BacktestTrade[], initialCapital: number): LineChartPoint[] {
  const result = closed.reduce<DrawdownAccumulator>(
    (acc, trade) => {
      const equity = acc.equity + trade.pnlAmount!;
      const peak = Math.max(acc.peak, equity);
      const drawdownPct = peak > 0 ? ((equity - peak) / peak) * 100 : 0;
      return { points: [...acc.points, { x: acc.points.length, y: drawdownPct }], equity, peak };
    },
    { points: [{ x: 0, y: 0 }], equity: initialCapital, peak: initialCapital },
  );
  return result.points;
}

/** Drawdown from the running equity peak, expressed as a negative percentage (0 = at a new peak). */
export function DrawdownCurveChart({ trades, initialCapital }: DrawdownCurveChartProps) {
  const points = buildDrawdownPoints(closedTradesByExit(trades), initialCapital);

  return (
    <Card>
      <CardHeader title="Drawdown curve" description="Percentage below the running equity peak." />
      <CardBody>
        <LineChart points={points} color="var(--sell)" referenceY={0} />
      </CardBody>
    </Card>
  );
}
