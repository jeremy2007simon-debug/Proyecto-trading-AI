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
 *  - forward evidence ledger rows -> ORDER_SUBMITTED / GUARD_BLOCKED /
 *    STRATEGY_SIGNAL events (empty today — 0 rows recorded in this
 *    environment).
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
    if (row.finalState === "EXECUTED") {
      events.push({
        id: `rs3m-executed-${row.timestamp}`,
        type: "ORDER_SUBMITTED",
        domain: "execution",
        timestamp: row.timestamp,
        strategyId: RS3M_CANDIDATE_V1.candidateId,
        summary: `RS3M rebalance executed for ${row.decisionMonth ?? "unknown month"} — ${row.submittedOrders.length} order(s) submitted, target ${row.targetAsset ?? "n/a"}.`,
        sourceDoc: "results/block6/forward/ledger.jsonl",
      });
    } else if (row.finalState === "BLOCKED") {
      events.push({
        id: `rs3m-blocked-${row.timestamp}`,
        type: "GUARD_BLOCKED",
        domain: "execution",
        timestamp: row.timestamp,
        strategyId: RS3M_CANDIDATE_V1.candidateId,
        summary: `RS3M rebalance blocked for ${row.decisionMonth ?? "unknown month"} — ${row.guardViolations.map((v) => v.guard).join(", ") || "unspecified guard"}.`,
        sourceDoc: "results/block6/forward/ledger.jsonl",
      });
    }
  }

  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
