import type { ExecutionCostConfig } from "@/core/backtesting/types";

/**
 * Block 5 — Strategy Discovery & Validation Engine, Stage 3 (transaction
 * costs). Extracted from the Block 4.5 research script (previously
 * duplicated inline) so the funnel and any future research script share
 * ONE tested implementation instead of copy-pasting it again.
 */

/** bps=5 is exactly the reference `REALISTIC_COST_SCENARIO` (0.0005 slippagePct, $0.005 halfSpread, see `backtesting/types.ts`) — every other level scales both components proportionally from that reference point. A defined convention, never presented as anything else. */
export function costsForBps(bps: number): ExecutionCostConfig {
  const scale = bps / 5;
  return { commissionPerFill: 0, slippagePct: 0.0005 * scale, halfSpread: 0.005 * scale };
}

export interface CostSensitivityPoint {
  bps: number;
  expectancyR: number;
}

export type BreakEvenCostReason = "CROSSED" | "NEGATIVE_AT_ZERO_COST" | "POSITIVE_THROUGHOUT_TESTED_RANGE";

export interface BreakEvenCostResult {
  breakEvenBps: number | null;
  reason: BreakEvenCostReason;
  note: string;
}

/**
 * Linear interpolation between the two adjacent tested bps points that
 * bracket `expectancyR = 0` — an approximation over already-computed
 * results, never a search/optimization over strategy parameters. Requires
 * at least 2 points; returns a "no crossing found" result rather than
 * extrapolating beyond the tested range.
 */
export function computeBreakEvenCost(points: readonly CostSensitivityPoint[]): BreakEvenCostResult {
  const sorted = [...points].sort((a, b) => a.bps - b.bps);

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const crosses = (a.expectancyR >= 0 && b.expectancyR < 0) || (a.expectancyR < 0 && b.expectancyR >= 0);
    if (crosses) {
      const t = (0 - a.expectancyR) / (b.expectancyR - a.expectancyR);
      const breakEvenBps = a.bps + t * (b.bps - a.bps);
      return {
        breakEvenBps,
        reason: "CROSSED",
        note: `Linearly interpolated between ${a.bps}bps (expectancyR=${a.expectancyR.toFixed(4)}) and ${b.bps}bps (expectancyR=${b.expectancyR.toFixed(4)}).`,
      };
    }
  }

  if (sorted.length > 0 && sorted[0].bps === 0 && sorted.every((p) => p.expectancyR < 0)) {
    return {
      breakEvenBps: null,
      reason: "NEGATIVE_AT_ZERO_COST",
      note: "Expectancy is already negative at 0bps — there is no positive break-even cost; the strategy has no gross edge to begin with at this sample.",
    };
  }

  return {
    breakEvenBps: null,
    reason: "POSITIVE_THROUGHOUT_TESTED_RANGE",
    note: `Expectancy stays >= 0 across the entire tested range (0-${sorted[sorted.length - 1]?.bps ?? 0}bps) — the break-even cost is beyond what was tested here.`,
  };
}

export type CostRobustnessLabel =
  | "EXTREMELY_FRAGILE"
  | "FRAGILE"
  | "WEAK"
  | "POTENTIALLY_EXECUTABLE"
  | "STRONGER_EXECUTION_MARGIN";

/**
 * Robustness label per the Block 5 spec's own ranges (documented as
 * informal buckets, never used as the sole promotion criterion — see
 * `classification.ts`, which weighs several signals together).
 */
export function classifyCostRobustness(result: BreakEvenCostResult): CostRobustnessLabel {
  if (result.reason === "NEGATIVE_AT_ZERO_COST") return "EXTREMELY_FRAGILE";
  if (result.reason === "POSITIVE_THROUGHOUT_TESTED_RANGE") return "STRONGER_EXECUTION_MARGIN";

  const bps = result.breakEvenBps ?? 0;
  if (bps < 1) return "EXTREMELY_FRAGILE";
  if (bps < 2) return "FRAGILE";
  if (bps < 3) return "WEAK";
  if (bps < 5) return "POTENTIALLY_EXECUTABLE";
  return "STRONGER_EXECUTION_MARGIN";
}
