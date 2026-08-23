/**
 * Block 10 §2 — CA_CANDIDATE_V1's CANONICAL signal evaluation.
 *
 * Block 9.y's independent reproduction of C-A found 4/8194 trigger-day
 * mismatches against the original (Block 9.x) implementation, fully
 * explained by two different-but-equally-standard percentile
 * interpolation methods (linear interpolation vs. nearest-rank) —
 * reported there as an immaterial, EXPLAINED discrepancy, not a bug.
 * This block resolves that ambiguity EXPLICITLY and permanently:
 *
 * **CANONICAL METHOD: linear interpolation between the two bracketing
 * order statistics** — i.e. the SAME method
 * `src/core/strategy2-research/short-term-reversal.ts`'s `quantile()`
 * already uses. Chosen because it is the method the ACTUAL VERIFIED
 * candidate (Block 9.y's `status: "VERIFIED"` decision) was evaluated
 * under — canonicalizing to the independent reproduction's nearest-rank
 * method instead would silently swap in a variant that was never itself
 * independently verified end-to-end.
 *
 * This does NOT change `C_A_FROZEN_SPEC`'s hash (`f6b860f5`,
 * `src/core/strategy2-verification/candidate-specs.ts`) — that hash
 * covers the STRATEGY's economic parameter values (lookback, decile
 * threshold, stop logic, costs), which are unchanged. The interpolation
 * method is an IMPLEMENTATION CHOICE for computing an unambiguously
 * named but multiply-realizable statistic ("bottom decile"), pinned here
 * by a dedicated, tested code path instead of by inflating what the spec
 * hash is meant to detect. `tests/core/ca-shadow/canonical-signal.test.ts`
 * is the actual enforcement mechanism: it proves this module reproduces
 * the ORIGINAL implementation's day-by-day trigger flags EXACTLY (0
 * discrepancies) on real historical data — tighter than Block 9.y's own
 * "4/8194, explained" reproduction bar.
 */

export interface CanonicalCaSignalPoint {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface CanonicalCaSignalResult {
  /** The most recently CLOSED bar's date — the decision basis (see §10 of the Block 10 brief: this is "yesterday" relative to the hypothetical entry day). */
  decisionDate: string;
  /** close(decisionDate) / close(previous trading day) - 1 — the return being tested against the trailing distribution. */
  decisionReturn: number;
  /** The bottom-decile threshold value, canonical (linear-interpolation) method, computed from the `lookbackDays` returns ending ONE DAY BEFORE `decisionDate` (excludes `decisionReturn` itself — see the module doc comment). */
  percentileThreshold: number;
  /** Fraction of the trailing window's returns <= `decisionReturn` — informational only (not itself the trigger condition, which is `decisionReturn <= percentileThreshold`). */
  percentileRank: number;
  /** `decisionReturn <= percentileThreshold` — if true, the hypothetical entry is at CLOSE(decisionDate), held to CLOSE(nextTradingDay). */
  triggered: boolean;
  windowSize: number;
  sufficientHistory: boolean;
}

/** Canonical percentile method: linear interpolation between bracketing order statistics — identical to `short-term-reversal.ts`'s own `quantile()`. */
export function canonicalQuantile(sortedAscending: readonly number[], q: number): number {
  const idx = (sortedAscending.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAscending[lo];
  return sortedAscending[lo] + (sortedAscending[hi] - sortedAscending[lo]) * (idx - lo);
}

function percentileRankOf(sortedAscending: readonly number[], value: number): number {
  let countAtOrBelow = 0;
  for (const v of sortedAscending) if (v <= value) countAtOrBelow += 1;
  return countAtOrBelow / sortedAscending.length;
}

/**
 * Evaluates the canonical C-A signal AS OF the most recent close present
 * in `points` (the last element — CAUSAL by construction: nothing after
 * it is read). `points` must be chronological ascending, one row per
 * trading day, no gaps assumed beyond what the input itself omits.
 */
export function evaluateCanonicalCaSignal(points: readonly CanonicalCaSignalPoint[], lookbackDays = 252, decileThreshold = 0.1): CanonicalCaSignalResult | undefined {
  if (points.length < 2) return undefined;
  const n = points.length;
  const decisionDate = points[n - 1].date;
  const decisionReturn = points[n - 1].close / points[n - 2].close - 1;

  // The window is the `lookbackDays` returns ending ONE DAY BEFORE decisionReturn — i.e. it
  // EXCLUDES decisionReturn itself. This matches `short-term-reversal.ts`'s ACTUAL code exactly
  // (verified by index arithmetic, not by that file's own doc comment, which is imprecise on this
  // point: `window = returns.slice(i-1-lookback, i-1)` never includes `returns[i-1]`, the value
  // being tested). Getting this one-day boundary right is exactly what a canonical, independently
  // re-derived implementation exists to catch — see `tests/core/ca-shadow/canonical-signal.test.ts`.
  const returns: number[] = [];
  for (let k = Math.max(1, n - 1 - lookbackDays); k < n - 1; k++) {
    returns.push(points[k].close / points[k - 1].close - 1);
  }

  const sufficientHistory = returns.length >= lookbackDays;
  if (!sufficientHistory) {
    return { decisionDate, decisionReturn, percentileThreshold: NaN, percentileRank: NaN, triggered: false, windowSize: returns.length, sufficientHistory: false };
  }

  const sortedAscending = [...returns].sort((a, b) => a - b);
  const percentileThreshold = canonicalQuantile(sortedAscending, decileThreshold);
  const percentileRank = percentileRankOf(sortedAscending, decisionReturn);
  const triggered = decisionReturn <= percentileThreshold;

  return { decisionDate, decisionReturn, percentileThreshold, percentileRank, triggered, windowSize: returns.length, sufficientHistory: true };
}
