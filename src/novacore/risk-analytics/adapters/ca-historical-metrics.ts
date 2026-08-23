/**
 * Block 10 §5/§21 — CA_CANDIDATE_V1 historical/OOS/robustness metrics,
 * TRANSCRIBED (never recomputed) from `docs/BLOCK9Y_INDEPENDENT_
 * VERIFICATION_REPORT.md` §4-8 and §17-19 — the same "no recalcular"
 * principle `rs3m-historical-metrics.ts` already established for RS3M.
 * These are BACKTEST/verification-era figures, never mixed with C-A's
 * own shadow forward evidence (`results/block10/ca-forward/**`, read via
 * `scripts/block10/ca-shadow/evidence-store.ts`).
 */

export interface CaHistoricalMetrics {
  periodStart: string;
  periodEnd: string;
  totalReturnPct: number;
  /** Derived from `totalReturnPct` and the period above via the standard CAGR formula — the report itself states total return and cost-scenario figures but not a pre-computed CAGR, so this one field is a deterministic transformation of already-published numbers, not an independently invented figure (see `sourceDoc`). */
  cagrPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  dsrCumulativePool: number;
  sourceDoc: string;
}

/** Full history, ~392 months, 1994-01 through ~2026-08 — report §4-8, "Cost realism" (REALISTIC scenario) and Multiple Testing §17. */
export const CA_FULL_HISTORY_METRICS: CaHistoricalMetrics = {
  periodStart: "1994-01",
  periodEnd: "2026-08",
  totalReturnPct: 253.3,
  cagrPct: 3.95,
  maxDrawdownPct: 17.3,
  sharpe: 0.613,
  dsrCumulativePool: 0.695,
  sourceDoc: "docs/BLOCK9Y_INDEPENDENT_VERIFICATION_REPORT.md §4-8, §17 (cagrPct derived from totalReturnPct + period)",
};

export interface CaOosMetrics {
  oosTotalReturnPct: number;
  oosMonths: number;
  rollingOosPositivePct: number;
  rollingOosWindows: number;
  rollingOosWorstPct: number;
  walkForwardPositivePct: number;
  walkForwardWindows: number;
  walkForwardWorstPct: number;
  walkForwardBestPct: number;
  sourceDoc: string;
}

/** Report §4-8/§18. */
export const CA_OOS_METRICS: CaOosMetrics = {
  oosTotalReturnPct: 35.4,
  oosMonths: 117,
  rollingOosPositivePct: 80,
  rollingOosWindows: 15,
  rollingOosWorstPct: -15.7,
  walkForwardPositivePct: 70.7,
  walkForwardWindows: 41,
  walkForwardWorstPct: -7.2,
  walkForwardBestPct: 13.0,
  sourceDoc: "docs/BLOCK9Y_INDEPENDENT_VERIFICATION_REPORT.md §4-8, §18",
};

export interface CaCostRobustness {
  referenceRebalanceCostBps: number;
  breakEvenCostBps: number;
  tradesPerYear: number;
  sourceDoc: string;
}

/** Report §4-8. */
export const CA_COST_ROBUSTNESS: CaCostRobustness = {
  referenceRebalanceCostBps: 3, // SWING_ROUND_TRIP_BPS.REALISTIC — see src/core/us-index-research/cost-model.ts, reused unmodified per §11/§22
  breakEvenCostBps: 17.8,
  tradesPerYear: 26.8,
  sourceDoc: "docs/BLOCK9Y_INDEPENDENT_VERIFICATION_REPORT.md §4-8",
};

export interface CaRs3mCorrelation {
  returnCorrelation: number;
  drawdownCorrelation: number;
  exposureOverlapPct: number;
  crisisQuartileCorrelation: number;
  sourceDoc: string;
}

/** Report §19 — "richer" RS3M correlation detail. */
export const CA_RS3M_CORRELATION: CaRs3mCorrelation = {
  returnCorrelation: 0.077,
  drawdownCorrelation: 0.492,
  exposureOverlapPct: 10.6,
  crisisQuartileCorrelation: 0.052,
  sourceDoc: "docs/BLOCK9Y_INDEPENDENT_VERIFICATION_REPORT.md §19",
};

export interface CaPortfolioBlend {
  windowLabel: string;
  rs3mAloneSharpe: number;
  rs3mAloneMaxDrawdownPct: number;
  blendSharpe: number;
  blendMaxDrawdownPct: number;
  sourceDoc: string;
}

/** Report's own two explicit, identically-defined comparison windows — §2 (official) and §4-8/portfolio-contribution text (extended). */
export const CA_PORTFOLIO_BLENDS: CaPortfolioBlend[] = [
  { windowLabel: "Official (2016-01 to 2026-08, 128mo)", rs3mAloneSharpe: 1.028, rs3mAloneMaxDrawdownPct: 23.67, blendSharpe: 1.039, blendMaxDrawdownPct: 20.16, sourceDoc: "docs/BLOCK9Y_INDEPENDENT_VERIFICATION_REPORT.md §2" },
  { windowLabel: "Extended (1994-01 to 2026-08, 392mo)", rs3mAloneSharpe: 0.736, rs3mAloneMaxDrawdownPct: 65.11, blendSharpe: 0.878, blendMaxDrawdownPct: 44.19, sourceDoc: "docs/BLOCK9Y_INDEPENDENT_VERIFICATION_REPORT.md §2" },
];
