import type { SampleQualityLabel } from "@/core/backtesting/types";

/**
 * Block 5 — Classification (Fase 13/14). Pure function of a funnel
 * summary; never a single metric. Criteria match the spec verbatim —
 * never relaxed to manufacture a CANDIDATE/VALIDATED. `REJECTED` is a
 * fully valid, expected outcome, not a failure of the process.
 */
export type StrategyClassification = "REJECTED" | "RESEARCH" | "CANDIDATE" | "VALIDATED";

export interface FunnelSummary {
  sanityPassed: boolean;
  /** `undefined` when it couldn't be computed (e.g. zero trades). */
  zeroCostExpectancyR: number | undefined;
  realisticCostExpectancyR: number | undefined;
  breakEvenBps: number | null;
  oosExpectancyR: number | undefined;
  /** 0-100. `undefined` when walk-forward wasn't run (didn't reach that stage). */
  walkForwardPositiveWindowPct: number | undefined;
  walkForwardWindowCount: number;
  sampleQuality: SampleQualityLabel;
  /** How many of the cross-asset checks (Stage 7) also showed positive expectancyR, out of how many tested. */
  crossAssetPositiveCount: number;
  crossAssetTestedCount: number;
  /** Monte Carlo P95 max drawdown %, when Stage 9 ran. */
  monteCarloDrawdownP95Pct: number | undefined;
  /** How many market regimes (Stage 8) showed positive expectancyR with at least LOW sample quality. */
  positiveRegimeCount: number;
}

export interface ClassificationResult {
  classification: StrategyClassification;
  reasons: string[];
}

/** Documented, non-catastrophic threshold for Monte Carlo P95 max drawdown — a judgment call, not derived from a formula; disclosed so it can be challenged. */
const MONTE_CARLO_NON_CATASTROPHIC_DD_PCT = 90;
/** Documented threshold for "a clear majority of walk-forward windows were profitable." */
const WALK_FORWARD_MAJORITY_PCT = 50;

export function classifyStrategy(summary: FunnelSummary): ClassificationResult {
  if (!summary.sanityPassed) {
    return { classification: "REJECTED", reasons: ["Failed the sanity stage (insufficient trades or unusable metrics)."] };
  }
  if (summary.zeroCostExpectancyR === undefined || summary.zeroCostExpectancyR <= 0) {
    return { classification: "REJECTED", reasons: ["No positive gross (zero-cost) edge — nothing for realistic costs to erode."] };
  }
  if (summary.realisticCostExpectancyR === undefined || summary.realisticCostExpectancyR <= 0) {
    return {
      classification: "REJECTED",
      reasons: [
        `Non-positive expectancyR at realistic execution cost (break-even cost ${summary.breakEvenBps === null ? "not reached in tested range" : `~${summary.breakEvenBps.toFixed(2)}bps`}).`,
      ],
    };
  }
  if (summary.oosExpectancyR === undefined || summary.oosExpectancyR <= 0) {
    return { classification: "REJECTED", reasons: ["Non-positive out-of-sample expectancyR — the edge did not survive on unseen data."] };
  }

  const walkForwardOk = (summary.walkForwardPositiveWindowPct ?? 0) >= WALK_FORWARD_MAJORITY_PCT;
  const sampleOk = summary.sampleQuality === "MEDIUM" || summary.sampleQuality === "HIGH";

  if (!walkForwardOk || !sampleOk) {
    const reasons: string[] = [];
    if (!sampleOk) reasons.push(`Sample quality is ${summary.sampleQuality}, below the MEDIUM/HIGH bar required for CANDIDATE.`);
    if (!walkForwardOk) {
      reasons.push(
        summary.walkForwardWindowCount === 0
          ? "Walk-forward was never reached (or produced no windows)."
          : `Only ${(summary.walkForwardPositiveWindowPct ?? 0).toFixed(1)}% of walk-forward windows were positive (need >= ${WALK_FORWARD_MAJORITY_PCT}%).`,
      );
    }
    return { classification: "RESEARCH", reasons };
  }

  // CANDIDATE bar cleared (positive full-period, OOS, majority walk-forward, sufficient sample).
  const crossAssetReproduced = summary.crossAssetTestedCount > 0 && summary.crossAssetPositiveCount >= 1;
  const monteCarloOk =
    summary.monteCarloDrawdownP95Pct !== undefined && summary.monteCarloDrawdownP95Pct < MONTE_CARLO_NON_CATASTROPHIC_DD_PCT;
  const regimeOk = summary.positiveRegimeCount >= 1;

  if (crossAssetReproduced && monteCarloOk && regimeOk) {
    return {
      classification: "VALIDATED",
      reasons: [
        "Reproduces a positive edge in at least one other asset.",
        `Monte Carlo P95 max drawdown (${summary.monteCarloDrawdownP95Pct?.toFixed(1)}%) is below the ${MONTE_CARLO_NON_CATASTROPHIC_DD_PCT}% non-catastrophic threshold.`,
        "At least one market regime shows a positive edge.",
      ],
    };
  }

  const gaps: string[] = [];
  if (!crossAssetReproduced) gaps.push("cross-asset reproduction not (yet) confirmed");
  if (!monteCarloOk) gaps.push("Monte Carlo drawdown distribution not confirmed non-catastrophic");
  if (!regimeOk) gaps.push("no regime with a confirmed positive edge");

  return {
    classification: "CANDIDATE",
    reasons: [
      "Clears full-period, OOS, walk-forward-majority, and sample-size bars.",
      `Falls short of VALIDATED: ${gaps.join("; ")}.`,
    ],
  };
}
