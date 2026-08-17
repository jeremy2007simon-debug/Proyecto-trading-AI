import type { BacktestTrade, MonteCarloResult } from "@/core/backtesting/types";

/**
 * Deterministic PRNG (mulberry32) — a simple, public-domain, seeded
 * generator. Using `Math.random()` here would make Monte Carlo results
 * unreproducible from one run to the next, which defeats the point of
 * recording `seed` on the result for later audit.
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

/**
 * Bootstrap-resampling risk analysis over a completed backtest's
 * realized R-multiple sequence — NOT a forecast of future returns. Each
 * of `numSimulations` runs draws `trades.length` R-multiples WITH
 * REPLACEMENT from the actual realized sequence (the only distribution
 * this system has any evidence for), replays them in that resampled
 * order into a synthetic compounding equity curve (each trade risking
 * `riskPerTradePct` of equity AT THAT POINT, same compounding
 * convention the real simulator uses), and records that simulation's
 * max drawdown, ending equity, and longest losing streak. The P5/P50/P95
 * spread across simulations answers "how much could sequencing alone —
 * same trades, different order — have hurt/helped," which is a risk
 * question, not a profitability prediction: it can never manufacture an
 * edge the real trade sequence didn't already show.
 */
export function runMonteCarloSimulation(
  trades: readonly BacktestTrade[],
  initialCapital: number,
  riskPerTradePct: number,
  numSimulations = 1000,
  seed = 42,
): MonteCarloResult {
  const rValues = trades.map((t) => t.pnlR ?? 0);

  if (rValues.length === 0) {
    return {
      numSimulations,
      seed,
      maxDrawdownPct: { p5: 0, p50: 0, p95: 0 },
      endingEquity: { p5: initialCapital, p50: initialCapital, p95: initialCapital },
      losingStreak: { p5: 0, p50: 0, p95: 0 },
    };
  }

  const rng = mulberry32(seed);
  const maxDrawdowns: number[] = [];
  const endingEquities: number[] = [];
  const losingStreaks: number[] = [];

  for (let sim = 0; sim < numSimulations; sim++) {
    let equity = initialCapital;
    let peak = initialCapital;
    let maxDrawdown = 0;
    let currentLosingStreak = 0;
    let maxLosingStreak = 0;

    for (let t = 0; t < rValues.length; t++) {
      const r = rValues[Math.floor(rng() * rValues.length)];
      equity *= 1 + (r * riskPerTradePct) / 100;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak > 0 ? ((peak - equity) / peak) * 100 : 0);

      if (r < 0) {
        currentLosingStreak += 1;
        maxLosingStreak = Math.max(maxLosingStreak, currentLosingStreak);
      } else {
        currentLosingStreak = 0;
      }
    }

    maxDrawdowns.push(maxDrawdown);
    endingEquities.push(equity);
    losingStreaks.push(maxLosingStreak);
  }

  return {
    numSimulations,
    seed,
    maxDrawdownPct: percentiles(maxDrawdowns),
    endingEquity: percentiles(endingEquities),
    losingStreak: percentiles(losingStreaks),
  };
}
