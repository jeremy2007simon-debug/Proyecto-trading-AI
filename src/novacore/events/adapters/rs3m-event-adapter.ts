import "server-only";

import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import type { StatusTransition } from "@/core/paper-trading/rs3m/status";
import type { NovaCoreEvent } from "@/novacore/events/types";
import { readRs3mStatusFile } from "@/novacore/strategy-hub/adapters/rs3m-status-reader";
import { readForwardEvidenceLedger } from "../../../../scripts/block6/paper/forward-evidence-store";

/**
 * Block 7 — maps RS3M's real, persisted history into the common
 * `NovaCoreEvent` shape. Two sources, both read-only:
 *
 *  - status transitions: from the live `results/block6/candidate/rs3m-v1-status.json`
 *    when present, otherwise a transcription of the three transitions
 *    both `scripts/block6/write-status.ts` and
 *    `docs/RS3M_FORWARD_PAPER_TRACKING.md` agree on (CANDIDATE_FROZEN ->
 *    AUDIT_PASSED -> PAPER_READY) — see `rs3m-adapter.ts`'s doc comment
 *    for why NovaCore doesn't assume PAPER_RUNNING without a live file.
 *  - forward evidence ledger rows -> one FORWARD_EVIDENCE_RECORDED event
 *    per row plus a more specific one based on `finalState`
 *    (ORDER_SUBMITTED / SIGNAL_GENERATED / SIGNAL_AWAITING_APPROVAL /
 *    GUARD_BLOCKED / BROKER_ERROR) — empty today, 0 rows recorded in this
 *    environment.
 */

const DOCUMENTED_STATUS_FALLBACK: StatusTransition[] = [
  { status: "CANDIDATE_FROZEN", reason: "RS3M_CANDIDATE_V1 frozen from the single Block 5 CANDIDATE (Relative Strength, 3-month lookback).", timestamp: "2026-08-17T09:19:00.000Z" },
  { status: "AUDIT_PASSED", reason: "Independent engine audit found no look-ahead bias; independent reimplementation reproduced 124 rebalances with 0 discrepancies.", timestamp: "2026-08-17T13:00:00.000Z" },
  { status: "PAPER_READY", reason: "Paper-trading infrastructure built and tested; deliberately not advanced further given the OOS underperformance finding — see docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md.", timestamp: "2026-08-17T15:30:00.000Z" },
];

export function getRs3mEvents(): NovaCoreEvent[] {
  const events: NovaCoreEvent[] = [];
  const statusFile = readRs3mStatusFile();

  const transitions = statusFile?.history ?? DOCUMENTED_STATUS_FALLBACK;
  for (const transition of transitions) {
    events.push({
      id: `rs3m-status-${transition.status}-${transition.timestamp}`,
      type: "STRATEGY_STATUS_CHANGED",
      domain: "strategy",
      timestamp: transition.timestamp,
      strategyId: RS3M_CANDIDATE_V1.candidateId,
      summary: `RS3M_CANDIDATE_V1 → ${transition.status}`,
      detail: { reason: transition.reason },
      sourceDoc: statusFile ? "results/block6/candidate/rs3m-v1-status.json (live)" : "docs/RS3M_FORWARD_PAPER_TRACKING.md / scripts/block6/write-status.ts (documented fallback)",
    });
  }

  const ledger = readForwardEvidenceLedger();
  for (const row of ledger) {
    const month = row.decisionMonth ?? "unknown month";

    events.push({
      id: `rs3m-forward-evidence-${row.timestamp}`,
      type: "FORWARD_EVIDENCE_RECORDED",
      domain: "execution",
      timestamp: row.timestamp,
      strategyId: RS3M_CANDIDATE_V1.candidateId,
      summary: `Forward evidence recorded for ${month} — outcome ${row.finalState}.`,
      sourceDoc: "results/block6/forward/ledger.jsonl",
    });

    if (row.finalState === "EXECUTED") {
      events.push({
        id: `rs3m-executed-${row.timestamp}`,
        type: "ORDER_SUBMITTED",
        domain: "execution",
        timestamp: row.timestamp,
        strategyId: RS3M_CANDIDATE_V1.candidateId,
        summary: `RS3M rebalance executed for ${month} — ${row.submittedOrders.length} order(s) submitted, target ${row.targetAsset ?? "n/a"}.`,
        sourceDoc: "results/block6/forward/ledger.jsonl",
      });
    } else if (row.finalState === "NO_REBALANCE_NEEDED") {
      events.push({
        id: `rs3m-signal-${row.timestamp}`,
        type: "SIGNAL_GENERATED",
        domain: "signal",
        timestamp: row.timestamp,
        strategyId: RS3M_CANDIDATE_V1.candidateId,
        summary: `Signal computed for ${month} — winner ${row.winner ?? "CASH"}, no rebalance needed (already held).`,
        sourceDoc: "results/block6/forward/ledger.jsonl",
      });
    } else if (row.finalState === "BLOCKED") {
      const onlyApproval = row.guardViolations.length === 1 && row.guardViolations[0].guard === "APPROVAL_REQUIRED";
      if (onlyApproval) {
        events.push({
          id: `rs3m-awaiting-approval-${row.timestamp}`,
          type: "SIGNAL_AWAITING_APPROVAL",
          domain: "approval",
          timestamp: row.timestamp,
          strategyId: RS3M_CANDIDATE_V1.candidateId,
          summary: `Signal for ${month} awaiting manual approval — winner ${row.winner ?? "CASH"}, target ${row.targetAsset ?? "n/a"}.`,
          sourceDoc: "results/block6/forward/ledger.jsonl",
        });
      } else {
        events.push({
          id: `rs3m-blocked-${row.timestamp}`,
          type: "GUARD_BLOCKED",
          domain: "guard",
          timestamp: row.timestamp,
          strategyId: RS3M_CANDIDATE_V1.candidateId,
          summary: `RS3M rebalance blocked for ${month} — ${row.guardViolations.map((v) => v.guard).join(", ") || "unspecified guard"}.`,
          sourceDoc: "results/block6/forward/ledger.jsonl",
        });
      }
    } else if (row.finalState === "SKIPPED") {
      events.push({
        id: `rs3m-skipped-${row.timestamp}`,
        type: "BROKER_ERROR",
        domain: "broker",
        timestamp: row.timestamp,
        strategyId: RS3M_CANDIDATE_V1.candidateId,
        summary: `Execution skipped for ${month}${row.skipReason ? `: ${row.skipReason}` : "."}`,
        sourceDoc: "results/block6/forward/ledger.jsonl",
      });
    }
  }

  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
