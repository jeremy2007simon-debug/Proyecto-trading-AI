/**
 * Block 7, section 7 — `ResearchProject`. Groups the hypotheses/experiments
 * tested under one research program so the Research Lab can show rollups
 * like "Hypotheses: 24, Rejected: 22, Research: 1, Candidates: 1" instead
 * of a flat experiment list. This is a NovaCore-level grouping on top of
 * the existing Block 4/4.5/5 reports and experiment registry — it does
 * not replace `src/core/backtesting/research/experiment-registry.ts` or
 * any report, only summarizes them.
 */
export interface ResearchProject {
  id: string;
  name: string;
  objective: string;
  createdAt: string;
  status: "ACTIVE" | "COMPLETE";

  hypothesesTotal: number;
  rejected: number;
  research: number;
  candidates: number;

  constraints: string[];
  benchmarks: string[];

  /** Free-text pointers into the frozen reports these counts were transcribed from — never recomputed. */
  notes: string;
  sourceDoc: string;
}

/**
 * Block 8.4 §26 — read-only independent-verification outcome for a
 * single candidate that has already been through a deep-research round
 * (Block 8.3's R3-B is the first). Deliberately NOT a `ResearchProject`
 * (this isn't a family/hypothesis rollup) and NOT wired into Strategy
 * Hub — the brief's own §26 only allows a Strategy Hub entry "si
 * sobrevive," which R3-B did not.
 */
export interface CandidateVerificationStatus {
  candidateId: string;
  sourceProject: string;
  verificationStatus: "VERIFIED_CANDIDATE" | "REJECTED";
  netCagrPct: number;
  oosNote: string;
  walkForwardNote: string;
  maxDrawdownPct: number;
  dsrNote: string;
  correlationVsRs3m: number;
  portfolioBenefitNote: string;
  verificationConfidenceNote: string;
  sourceDoc: string;
}

/**
 * Block 9 §10/§28 — one Top-5 Strategy #2 discovery family, READ-ONLY.
 * This is a LITERATURE-REVIEW record, not a `ResearchProject`: no
 * backtest has been run for any of these (§8/§29 — Block 9 Phase A
 * stops at pre-registration). Never wired into Strategy Hub or Bots.
 */
export interface Strategy2DiscoveryFamily {
  rank: number;
  letter: string;
  name: string;
  evidenceGrade: "A" | "B" | "C" | "D";
  economicRationale: string;
  markets: string;
  timeframe: string;
  dataFeasibility: "READY" | "PARTIAL" | "UNAVAILABLE";
  executionFeasibility: "ALPACA_COMPATIBLE" | "OTHER_BROKER_REQUIRED" | "RESEARCH_ONLY";
  expectedCorrelationWithRs3m: "LOW" | "MEDIUM" | "HIGH";
  tailRiskNote: string;
  crowdingRisk: "LOW" | "MEDIUM" | "MEDIUM-HIGH" | "HIGH";
  decayRisk: "LOW" | "LOW-MEDIUM" | "MEDIUM" | "HIGH";
  score: number;
  mainFalsificationRisk: string;
  sourceDoc: string;
}

/**
 * Block 9 §9/§28 — cumulative research trial ledger summary, READ-ONLY.
 * Full per-block breakdown lives in `results/block9/cumulative-trial-
 * ledger.json`; this is only the rollup the Research Lab page displays.
 */
export interface CumulativeTrialLedgerSummary {
  priorCumulativeFloor: string;
  newTrialsThisBlock: number;
  reconciledArithmetic: string;
  policy: string;
  sourceDoc: string;
}
