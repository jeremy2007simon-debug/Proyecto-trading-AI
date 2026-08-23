import type { CaForwardEvidenceRecord } from "@/core/ca-shadow/forward-evidence";

/**
 * Block 10 §23/§24 — the C-A Paper-promotion bar, defined and FROZEN
 * here, in this same commit that freezes Block 10 itself, BEFORE any
 * forward/shadow evidence has been observed (the ledger this evaluates
 * is empty at the time this file is written — see
 * `results/block10/ca-forward/` being gitignored and unpopulated in this
 * checkout). Per §22, these numbers can never be tuned after the fact to
 * make a particular forward outcome pass or fail.
 *
 * Two DELIBERATELY SEPARATE concepts (§24):
 *
 * - `operationalVerified`: does the SHADOW PIPELINE itself work
 *   correctly — no hash/adjustment tampering, no data source silently
 *   swapped, no inconsistent cost assumption, evidence keeps accumulating
 *   without repeated staleness. This says NOTHING about profitability.
 * - `forwardEvidenceSufficient`: has enough CALENDAR time and enough
 *   ACTUAL TRADES passed to say anything statistically meaningful at all
 *   — again, not a return bar. §23 is explicit: "no exigir un retorno
 *   arbitrario en pocos meses — el objetivo inicial del shadow es
 *   verificar comportamiento OPERACIONAL, no rentabilidad."
 *
 * Both must be true before C-A is even ELIGIBLE to be considered for a
 * *future*, separate Paper-connection decision — this module only
 * computes eligibility, it never itself promotes anything (§25/§26: no
 * Paper/LIVE connection exists in this codebase for C-A at all).
 */

export interface CaPromotionBarCriteria {
  /** Minimum trading days actually PROCESSED (decision !== "BLOCKED") before the pipeline itself is considered proven. */
  minForwardTradingDays: number;
  /** More than this many CONSECUTIVE days blocked on DATA_STALE signals an unreliable feed, not bad luck. */
  maxConsecutiveDataStaleBlocks: number;
  /** Minimum CALENDAR days since the frozen forward-start instant — C-A trades infrequently (§24), so a return-focused reader must not mistake "3 weeks" for "a real sample." */
  minForwardCalendarDays: number;
  /** Minimum COMPLETED round-trip trades (an EXIT closes a trade opened by a prior ENTER) — a single trade is never declared a success on its own (§24). */
  minShadowTrades: number;
}

/** Frozen at Block 10's own freeze commit — see the module doc comment. Never edited to fit an observed outcome. */
export const CA_PROMOTION_BAR: CaPromotionBarCriteria = {
  minForwardTradingDays: 20,
  maxConsecutiveDataStaleBlocks: 3,
  minForwardCalendarDays: 90,
  minShadowTrades: 5,
};

export interface CaOperationalDetails {
  tradingDaysProcessed: number;
  hasCandidateHashOrAdjustmentMismatch: boolean;
  longestConsecutiveDataStaleStreak: number;
  costBpsConsistent: boolean;
}

export interface CaForwardEvidenceDetails {
  calendarDaysSinceForwardStart: number;
  completedTrades: number;
}

export interface CaPromotionBarResult {
  operationalVerified: boolean;
  operational: CaOperationalDetails;
  forwardEvidenceSufficient: boolean;
  forwardEvidence: CaForwardEvidenceDetails;
}

function longestConsecutiveStreak(rows: readonly CaForwardEvidenceRecord[], predicate: (row: CaForwardEvidenceRecord) => boolean): number {
  let longest = 0;
  let current = 0;
  for (const row of rows) {
    if (predicate(row)) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

export interface EvaluateCaPromotionBarParams {
  dailyEquityRows: readonly CaForwardEvidenceRecord[];
  forwardStartTimestamp: string;
  nowIso: string;
  criteria?: CaPromotionBarCriteria;
}

export function evaluateCaPromotionBar(params: EvaluateCaPromotionBarParams): CaPromotionBarResult {
  const { dailyEquityRows, forwardStartTimestamp, nowIso } = params;
  const criteria = params.criteria ?? CA_PROMOTION_BAR;

  const processedRows = dailyEquityRows.filter((r) => r.decision !== "BLOCKED");
  const hashOrAdjustmentMismatch = dailyEquityRows.some((r) => r.guardResult.violations.some((v) => v.guard === "CANDIDATE_HASH_MISMATCH" || v.guard === "ADJUSTMENT_MISMATCH"));
  const longestStaleStreak = longestConsecutiveStreak(dailyEquityRows, (r) => r.guardResult.violations.some((v) => v.guard === "DATA_STALE"));
  const enterCostBpsValues = new Set(dailyEquityRows.filter((r) => r.decision === "ENTER").map((r) => r.costBps));
  const costBpsConsistent = enterCostBpsValues.size <= 1;

  const operational: CaOperationalDetails = {
    tradingDaysProcessed: processedRows.length,
    hasCandidateHashOrAdjustmentMismatch: hashOrAdjustmentMismatch,
    longestConsecutiveDataStaleStreak: longestStaleStreak,
    costBpsConsistent,
  };
  const operationalVerified = operational.tradingDaysProcessed >= criteria.minForwardTradingDays && !operational.hasCandidateHashOrAdjustmentMismatch && operational.longestConsecutiveDataStaleStreak <= criteria.maxConsecutiveDataStaleBlocks && operational.costBpsConsistent;

  const calendarDaysSinceForwardStart = Math.max(0, (new Date(nowIso).getTime() - new Date(forwardStartTimestamp).getTime()) / 86_400_000);
  const completedTrades = dailyEquityRows.filter((r) => r.decision === "EXIT").length;

  const forwardEvidence: CaForwardEvidenceDetails = { calendarDaysSinceForwardStart, completedTrades };
  const forwardEvidenceSufficient = forwardEvidence.calendarDaysSinceForwardStart >= criteria.minForwardCalendarDays && forwardEvidence.completedTrades >= criteria.minShadowTrades;

  return { operationalVerified, operational, forwardEvidenceSufficient, forwardEvidence };
}
