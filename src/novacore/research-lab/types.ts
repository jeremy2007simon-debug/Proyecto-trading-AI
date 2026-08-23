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

/**
 * Block 9.x §2-4 — one family's deep-backtest verdict, READ-ONLY,
 * transcribed from `docs/BLOCK9B_STRATEGY2_DEEP_BACKTEST_REPORT.md`.
 * Distinct from `Strategy2DiscoveryFamily` (Phase A, literature-only,
 * pre-backtest) — this is Phase B's actual funnel outcome.
 */
export interface Strategy2BacktestFamilyOutcome {
  letter: string;
  name: string;
  configsExecuted: number;
  configsDataInsufficient: number;
  candidateConfigIds: string[];
  verdict: "CANDIDATE_FOUND" | "NO_CANDIDATE";
  summary: string;
  sourceDoc: string;
}

/**
 * Block 9.x §5 — one surviving CANDIDATE's key figures + its portfolio
 * contribution alongside RS3M, READ-ONLY. `independentVerificationStatus`
 * was `"NOT_STARTED"` when this record was first created (Block 9.x
 * deliberately did not begin verification automatically); Block 9.y ran
 * that verification and updates it to the actual outcome —
 * `"VERIFIED"`/`"RESEARCH"`/`"REJECTED"`/`"DATA_INSUFFICIENT"` — never
 * silently left stale.
 */
export interface Strategy2CandidateSummary {
  configId: string;
  family: string;
  description: string;
  netTotalReturnPct: number;
  annualizedSharpe: number | undefined;
  maxDrawdownPct: number;
  dsrCumulativePool: number | undefined;
  correlationVsRs3m: number | undefined;
  portfolioBlendSharpe: number | undefined;
  portfolioBlendMaxDrawdownPct: number | undefined;
  independentVerificationStatus: "NOT_STARTED" | "VERIFIED" | "RESEARCH" | "REJECTED" | "DATA_INSUFFICIENT";
  sourceDoc: string;
}

/**
 * Block 9.y — one candidate's independent-verification outcome,
 * READ-ONLY, transcribed from
 * `docs/BLOCK9Y_INDEPENDENT_VERIFICATION_REPORT.md`. A falsification
 * round: `status` can be `REJECTED` even for a config Block 9.x called
 * `CANDIDATE` — that is the correct, expected, and here actual outcome
 * for one of the two, not a failure of the process.
 */
export interface Strategy2VerificationOutcome {
  configId: string;
  status: "VERIFIED" | "RESEARCH" | "REJECTED" | "DATA_INSUFFICIENT";
  specHash: string;
  reproductionVerdict: string;
  keyFailurePoints: string[];
  portfolioContribution: string;
  sourceDoc: string;
}
