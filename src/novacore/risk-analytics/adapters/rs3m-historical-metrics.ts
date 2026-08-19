/**
 * Block 7 — RS3M_CANDIDATE_V1 historical/OOS metrics, TRANSCRIBED (never
 * recomputed) from `docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md`, which
 * is itself generated from a single consistent run of `scripts/block6/**`
 * against real Alpaca data (2026-08-17 ~15:20 UTC — see that doc's own
 * header). Per the Block 7 spec ("no recalcular si ya existe una fuente
 * fiable"), NovaCore treats that report as the source of truth for these
 * numbers and only displays them — it never re-runs a backtest or
 * Monte Carlo simulation to produce them.
 *
 * Every field below cites the exact report section it was copied from so
 * a reviewer can verify each number against the doc directly. If the
 * report is ever regenerated with different figures, this file must be
 * updated by hand to match — it is intentionally NOT derived
 * programmatically from the doc's markdown.
 */

export interface Rs3mHistoricalMetrics {
  periodStart: string;
  periodEnd: string;
  totalReturnPct: number;
  cagrPct: number;
  volatilityPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  benchmarkSpyCagrPct: number;
  excessReturnVsSpyCagrPct: number;
  sourceDoc: string;
}

/** Full history, 124 months, 2016-01 through ~2026-08 — report §10. */
export const RS3M_FULL_HISTORY_METRICS: Rs3mHistoricalMetrics = {
  periodStart: "2016-01",
  periodEnd: "2026-08",
  totalReturnPct: 417.3,
  cagrPct: 17.24,
  volatilityPct: 17.4,
  maxDrawdownPct: 23.99,
  sharpe: 1.01,
  sortino: 1.84,
  calmar: 0.72,
  benchmarkSpyCagrPct: 15.46,
  excessReturnVsSpyCagrPct: 1.78,
  sourceDoc: "docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md §10",
};

export interface Rs3mOosMetrics {
  periodLabel: string;
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  sharpe: number;
  sortino: number;
  benchmarkSpyTotalReturnPct: number;
  benchmarkSpyCagrPct: number;
  excessReturnVsSpyPct: number;
  alphaAnnualizedPct: number;
  informationRatio: number;
  downsideCapturePct: number;
  upsideCapturePct: number;
  /**
   * This is the finding the Block 6 report calls "EL HALLAZGO CRÍTICO"
   * (§11-12): severe, persistent OOS underperformance vs. both
   * benchmarks over the most recent ~25 months, with an inverted
   * capture ratio. NovaCore must always surface this alongside the
   * full-history numbers above, never instead of it and never omitted —
   * showing only the favorable full-history figures would misrepresent
   * the audited finding.
   */
  note: string;
  sourceDoc: string;
}

/** Last 25 months (~sept-2024 to ago-2026) — report §11-12. */
export const RS3M_OOS_LAST_25_MONTHS_METRICS: Rs3mOosMetrics = {
  periodLabel: "Last 25 months (~2024-09 to 2026-08)",
  totalReturnPct: 17.32,
  cagrPct: 7.97,
  maxDrawdownPct: 19.01,
  sharpe: 0.52,
  sortino: 0.9,
  benchmarkSpyTotalReturnPct: 44.18,
  benchmarkSpyCagrPct: 19.2,
  excessReturnVsSpyPct: -26.87,
  alphaAnnualizedPct: -14.03,
  informationRatio: -1.12,
  downsideCapturePct: 159.7,
  upsideCapturePct: 84.5,
  note:
    "Severe, persistent OOS underperformance vs. SPY and equal-weight over the most recent ~25 months (3 consecutive down years: 2024 -17.6pp, 2025 -9.4pp, 2026 YTD -0.3pp), with an inverted capture ratio (more downside capture than upside). This is why Block 6 concluded AUDIT PASSED — PAPER READY rather than advancing straight to activation.",
  sourceDoc: "docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md §11-12",
};

export interface Rs3mCostRobustness {
  referenceRebalanceCostBps: number;
  breakEvenCostBps: number;
  sourceDoc: string;
}

/** Report §17. */
export const RS3M_COST_ROBUSTNESS: Rs3mCostRobustness = {
  referenceRebalanceCostBps: 20,
  breakEvenCostBps: 353.1,
  sourceDoc: "docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md §17",
};
