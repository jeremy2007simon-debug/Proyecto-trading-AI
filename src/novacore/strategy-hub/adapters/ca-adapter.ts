import "server-only";

import { CA_CANDIDATE_V1, EXPECTED_CA_CANDIDATE_V1_HASH, computeCaCandidateHash } from "@/core/ca-shadow/candidate";
import { CA_FULL_HISTORY_METRICS, CA_RS3M_CORRELATION } from "@/novacore/risk-analytics/adapters/ca-historical-metrics";
import type { NovaCoreStrategy, NovaCoreStrategyStatus } from "@/novacore/shared/types";
import { readCaForwardLedger, readLastShadowState } from "../../../../scripts/block10/ca-shadow/evidence-store";

/**
 * Block 10 §5/§20/§21 — the SECOND Strategy Hub entry, "Strategy #2":
 * C-A Short-Term Reversal, SHADOW environment. Mirrors `rs3m-adapter.ts`'s
 * own read-only discipline exactly:
 *
 *  - imports ONLY read functions (`readCaForwardLedger`,
 *    `readLastShadowState`) — never `appendCaForwardEvidence`.
 *  - never mutates `CA_CANDIDATE_V1` and never edits
 *    `src/core/ca-shadow/**` or `scripts/block10/**`.
 *  - the candidate hash is recomputed here only to CONFIRM it matches the
 *    independently pinned `EXPECTED_CA_CANDIDATE_V1_HASH`, exactly like
 *    `safety-guards.ts` does before evaluating a shadow day.
 *  - status is NEVER `PAPER_READY`/`PAPER`/`LIVE` — see
 *    `NovaCoreStrategyStatus`'s doc comment. `SHADOW_RUNNING` only when
 *    the forward-evidence ledger actually has rows (objective proof the
 *    Routine has fired for real); otherwise `SHADOW_READY` — the same
 *    two-phase distinction RS3M's own `PAPER_READY`/`PAPER_RUNNING`
 *    history established.
 */

function deriveStatus(hasForwardEvidence: boolean): NovaCoreStrategyStatus {
  return hasForwardEvidence ? "SHADOW_RUNNING" : "SHADOW_READY";
}

export interface CaAdapterResult {
  strategy: NovaCoreStrategy;
  candidateHashVerified: boolean;
  shadowEvidence: {
    daysProcessed: number;
    trades: number;
    lastProcessedDate: string | undefined;
    shadowEquity: number;
    currentPosition: "FLAT" | "LONG";
  };
}

export function getCaStrategy(): CaAdapterResult {
  const candidateHash = computeCaCandidateHash(CA_CANDIDATE_V1);
  const candidateHashVerified = candidateHash === EXPECTED_CA_CANDIDATE_V1_HASH;

  const dailyEquityRows = readCaForwardLedger("daily-equity");
  const lastState = readLastShadowState();
  const hasForwardEvidence = dailyEquityRows.length > 0;
  const status = deriveStatus(hasForwardEvidence);

  const trades = dailyEquityRows.filter((row) => row.decision === "ENTER").length;

  const strategy: NovaCoreStrategy = {
    // NovaCore's own strategy id, per Block 10 §5 ("/novacore/bots/CA_CANDIDATE_V1") — deliberately NOT
    // `CA_CANDIDATE_V1.candidateId` ("C-A", the shorter Block 9.x/9.y research label, frozen and unmodified
    // in the underlying spec). Both ids appear in `sourceOfTruth` below so either is traceable to the other.
    id: "CA_CANDIDATE_V1",
    version: "V1",
    name: "C-A — Short-Term Reversal",
    family: "SHORT_TERM_REVERSAL",
    status,
    broker: undefined, // structurally never connected to a broker — see §25
    environment: "SHADOW",
    candidateHash,
    hypothesis: "SPY time-series reversal: long for 1 trading day whenever yesterday's close-to-close return falls in the bottom decile of its own trailing 252-trading-day return distribution.",
    performance: {
      historical: {
        totalReturnPct: CA_FULL_HISTORY_METRICS.totalReturnPct,
        cagrPct: CA_FULL_HISTORY_METRICS.cagrPct,
        maxDrawdownPct: CA_FULL_HISTORY_METRICS.maxDrawdownPct,
        sharpe: CA_FULL_HISTORY_METRICS.sharpe,
        periodStart: CA_FULL_HISTORY_METRICS.periodStart,
        periodEnd: CA_FULL_HISTORY_METRICS.periodEnd,
        sourceDoc: CA_FULL_HISTORY_METRICS.sourceDoc,
      },
      forward: hasForwardEvidence
        ? {
            monthsObserved: new Set(dailyEquityRows.map((r) => r.date.slice(0, 7))).size,
            totalReturnPct: (lastState.shadowEquity - 1) * 100,
            sourceDoc: "results/block10/ca-forward/daily-equity/ledger.jsonl (live, SHADOW — hypothetical, not a broker account)",
          }
        : {
            monthsObserved: 0,
            sourceDoc: "results/block10/ca-forward/daily-equity/ledger.jsonl — no shadow evidence recorded yet in this environment (shadow Routine not yet fired, or Block 10 just frozen — see docs/BLOCK10_CA_SHADOW_FORWARD_VALIDATION.md §8 forward-start).",
          },
    },
    risk: {
      historicalMaxDrawdownPct: CA_FULL_HISTORY_METRICS.maxDrawdownPct,
      forwardMaxDrawdownPct: undefined,
      turnover: undefined,
      ordersRejected: 0,
      ordersPartialFill: 0,
      executionErrors: dailyEquityRows.filter((r) => r.decision === "BLOCKED").length,
    },
    sourceOfTruth: {
      "definition/hash": `src/core/ca-shadow/candidate.ts (frozen, re-exports Block 9.y's C_A_FROZEN_SPEC, research id "${CA_CANDIDATE_V1.candidateId}")`,
      "canonical signal": "src/core/ca-shadow/canonical-signal.ts (frozen, tests/core/ca-shadow/canonical-signal.test.ts proves exact reproduction)",
      status: hasForwardEvidence ? "results/block10/ca-forward/daily-equity/ledger.jsonl (live)" : "no forward evidence yet — status defaults to SHADOW_READY",
      "historical metrics": CA_FULL_HISTORY_METRICS.sourceDoc,
      "RS3M correlation": CA_RS3M_CORRELATION.sourceDoc,
      "forward/shadow evidence": "results/block10/ca-forward/** (read-only, append-only)",
      "broker account/positions": "NONE — structurally never connected, see src/core/ca-shadow/shadow-engine.ts and tests/core/ca-shadow/no-broker-writes.test.ts",
    },
  };

  return {
    strategy,
    candidateHashVerified,
    shadowEvidence: {
      daysProcessed: dailyEquityRows.length,
      trades,
      lastProcessedDate: lastState.lastProcessedDate,
      shadowEquity: lastState.shadowEquity,
      currentPosition: lastState.position,
    },
  };
}
