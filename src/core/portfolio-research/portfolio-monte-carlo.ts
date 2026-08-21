/**
 * Block 8.2 — Monte Carlo bootstrap over a monthly portfolio-return
 * series. Reuses the SAME technique as `core/backtesting/monte-carlo.ts`
 * (seeded mulberry32 PRNG, reshuffle-with-replacement, percentile
 * reporting) but is a separate, small implementation rather than a call
 * into that file: `runMonteCarloSimulation` is shaped around discrete
 * per-trade R-multiples compounded via `riskPerTradePct` — semantically
 * different from a periodic (monthly) portfolio return series, and
 * force-fitting one into the other's parameter shape (fabricating a
 * fake "trade" per month) was judged more likely to introduce a subtle
 * bug than writing this ~30-line equivalent directly against the real
 * data shape. Same disclaimer as the original: this is a bootstrap risk
 * analysis over REALIZED returns, never a forecast.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentileOf(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function percentiles(values: readonly number[]): { p5: number; p50: number; p95: number } {
  const sorted = [...values].sort((a, b) => a - b);
  return { p5: percentileOf(sorted, 5), p50: percentileOf(sorted, 50), p95: percentileOf(sorted, 95) };
}

export interface PortfolioMonteCarloResult {
  numSimulations: number;
  seed: number;
  maxDrawdownPct: { p5: number; p50: number; p95: number };
  terminalEquity: { p5: number; p50: number; p95: number };
  lossProbability: number;
  /** Fraction of simulations whose max drawdown reached >=50% — a coarse "ruin" proxy for a vol-targeted, unlevered-by-construction series (see `portfolio-engine.ts` for why no leverage is modeled). */
  ruinProbability: number;
}

export function runPortfolioMonteCarlo(monthlyReturns: readonly number[], numSimulations = 10_000, seed = 42): PortfolioMonteCarloResult {
  if (monthlyReturns.length === 0) {
    return { numSimulations, seed, maxDrawdownPct: { p5: 0, p50: 0, p95: 0 }, terminalEquity: { p5: 1, p50: 1, p95: 1 }, lossProbability: 0, ruinProbability: 0 };
  }

  const rng = mulberry32(seed);
  const maxDrawdowns: number[] = [];
  const terminalEquities: number[] = [];
  let lossCount = 0;
  let ruinCount = 0;

  for (let sim = 0; sim < numSimulations; sim++) {
    let equity = 1;
    let peak = 1;
    let maxDrawdown = 0;
    for (let t = 0; t < monthlyReturns.length; t++) {
      const r = monthlyReturns[Math.floor(rng() * monthlyReturns.length)];
      equity *= 1 + r;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak > 0 ? ((peak - equity) / peak) * 100 : 0);
    }
    maxDrawdowns.push(maxDrawdown);
    terminalEquities.push(equity);
    if (equity < 1) lossCount += 1;
    if (maxDrawdown >= 50) ruinCount += 1;
  }

  return {
    numSimulations,
    seed,
    maxDrawdownPct: percentiles(maxDrawdowns),
    terminalEquity: percentiles(terminalEquities),
    lossProbability: lossCount / numSimulations,
    ruinProbability: ruinCount / numSimulations,
  };
}
