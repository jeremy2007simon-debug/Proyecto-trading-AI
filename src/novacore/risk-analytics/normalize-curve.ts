/**
 * Block 7 / Observability Upgrade — pure helper: normalizes an equity/price
 * curve so its first point is 100, matching the standard "start = 100"
 * convention for comparing a strategy against a benchmark on the same
 * scale regardless of starting notional/price. No I/O, no randomness —
 * given the same input this always returns the same output.
 */
export interface NamedPoint {
  label: string;
  value: number;
}

export interface NormalizedPoint {
  label: string;
  value: number;
}

export function normalizeToBase100(points: readonly NamedPoint[]): NormalizedPoint[] {
  if (points.length === 0) return [];
  const base = points[0].value;
  if (base === 0) return points.map((p) => ({ label: p.label, value: 100 }));
  return points.map((p) => ({ label: p.label, value: (p.value / base) * 100 }));
}
