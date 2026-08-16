const WIDTH = 720;
const HEIGHT = 200;
const PADDING = 8;

export interface LineChartPoint {
  x: number;
  y: number;
}

interface LineChartProps {
  points: LineChartPoint[];
  color: string;
  /** When set, draws a horizontal reference line at this y value (e.g. 0). */
  referenceY?: number;
  emptyLabel?: string;
}

/**
 * Minimal hand-rolled SVG line chart — no charting library in
 * `package.json`, and none is added for this (point 20). Purely
 * presentational: callers derive `points` from real backtest trades,
 * this component only scales and draws them.
 */
export function LineChart({ points, color, referenceY, emptyLabel = "No data" }: LineChartProps) {
  if (points.length < 2) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted">
        {emptyLabel}
      </div>
    );
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys, referenceY ?? Infinity);
  const maxY = Math.max(...ys, referenceY ?? -Infinity);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const scaleX = (x: number) => PADDING + ((x - minX) / spanX) * (WIDTH - 2 * PADDING);
  const scaleY = (y: number) => HEIGHT - PADDING - ((y - minY) / spanY) * (HEIGHT - 2 * PADDING);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.x).toFixed(2)},${scaleY(p.y).toFixed(2)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[200px] w-full" preserveAspectRatio="none">
      {referenceY !== undefined ? (
        <line
          x1={PADDING}
          x2={WIDTH - PADDING}
          y1={scaleY(referenceY)}
          y2={scaleY(referenceY)}
          stroke="var(--border)"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
      ) : null}
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
