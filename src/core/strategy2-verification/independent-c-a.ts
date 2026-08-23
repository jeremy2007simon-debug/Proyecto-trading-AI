import type { Candle } from "@/core/market-data/types";
import { SWING_ROUND_TRIP_BPS, type CostScenario } from "@/core/us-index-research/cost-model";
import type { Strategy2DayResult } from "@/core/strategy2-research/types";

/**
 * Block 9.y — INDEPENDENT reproduction of C-A. Written from the frozen
 * spec (`candidate-specs.ts`) only — ZERO imports from
 * `src/core/strategy2-research/short-term-reversal.ts`. Deliberately
 * uses a DIFFERENT (but equally standard) percentile method — nearest-
 * rank rather than the original's linear-interpolation quantile — so a
 * discrepancy between the two would show up as a genuine algorithmic
 * difference to investigate, not be silently masked by reusing the
 * exact same helper function. Only generic, candidate-agnostic
 * infrastructure (`SWING_ROUND_TRIP_BPS`, the `Strategy2DayResult`
 * shape) is shared, per the same allowance Block 8.4 used for R3-B.
 */
export function runCAIndependentReproduction(candles: readonly Candle[], scenario: CostScenario, decileThreshold = 0.1, lookbackDays = 252): Strategy2DayResult[] {
  const bars = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const n = bars.length;

  // Fresh daily-return computation (independently derived, same necessarily-unambiguous formula).
  const dailyReturn: (number | undefined)[] = new Array(n).fill(undefined);
  for (let i = 1; i < n; i++) {
    dailyReturn[i] = bars[i].close / bars[i - 1].close - 1;
  }

  const roundTripFraction = SWING_ROUND_TRIP_BPS[scenario] / 10_000;
  const out: Strategy2DayResult[] = [];

  for (let i = lookbackDays + 1; i < n; i++) {
    const decisionReturn = dailyReturn[i - 1]; // known by close of day i-1
    if (decisionReturn === undefined) continue;

    // Window: the `lookbackDays` returns ending at (and including) day i-1.
    const windowReturns: number[] = [];
    for (let k = i - 1 - lookbackDays; k < i - 1; k++) {
      const r = dailyReturn[k];
      if (r !== undefined) windowReturns.push(r);
    }
    if (windowReturns.length < lookbackDays) continue;

    // Nearest-rank percentile (independent method from the original's linear-interpolation quantile()).
    const ascending = [...windowReturns].sort((a, b) => a - b);
    const rankIndex = Math.max(0, Math.ceil(decileThreshold * ascending.length) - 1);
    const threshold = ascending[rankIndex];

    const triggered = decisionReturn <= threshold;
    const grossReturn = triggered ? bars[i].close / bars[i - 1].close - 1 : 0;
    const costDrag = triggered ? roundTripFraction : 0;
    out.push({ date: bars[i].timestamp.slice(0, 10), grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover: triggered ? 1 : 0 });
  }
  return out;
}
