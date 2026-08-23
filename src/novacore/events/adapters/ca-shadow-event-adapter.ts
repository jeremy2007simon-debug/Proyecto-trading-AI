import "server-only";

import type { NovaCoreEvent } from "@/novacore/events/types";
import { readCaForwardLedger } from "../../../../scripts/block10/ca-shadow/evidence-store";

/**
 * Block 10 §20 — maps C-A's real, persisted shadow evidence
 * (`results/block10/ca-forward/daily-equity/ledger.jsonl`, read-only)
 * into the common `NovaCoreEvent` shape, exactly like
 * `rs3m-event-adapter.ts` does for RS3M's forward-evidence ledger. One
 * `FORWARD_EVIDENCE_RECORDED` event per day processed (blocked or not,
 * mirroring RS3M's own "every attempt is evidence" precedent), plus a
 * more specific event per `decision`: `SHADOW_POSITION_OPENED` (ENTER),
 * `SHADOW_POSITION_CLOSED` (EXIT), `STRATEGY_SIGNAL` (HOLD_FLAT/
 * HOLD_LONG_NO_ACTION with a triggered-but-not-yet-acted signal),
 * `SHADOW_BLOCKED` (BLOCKED). An initial `SHADOW_INITIALIZED` event marks
 * the very first row ever recorded.
 */
export function getCaShadowEvents(): NovaCoreEvent[] {
  const events: NovaCoreEvent[] = [];
  const rows = readCaForwardLedger("daily-equity");

  rows.forEach((row, index) => {
    if (index === 0) {
      events.push({
        id: `ca-shadow-initialized-${row.date}`,
        type: "SHADOW_INITIALIZED",
        domain: "strategy",
        timestamp: row.dataCutoff,
        strategyId: "CA_CANDIDATE_V1",
        summary: `C-A shadow forward validation initialized — first evaluated day ${row.date}, data source ${row.dataSource}.`,
        sourceDoc: "results/block10/ca-forward/daily-equity/ledger.jsonl",
      });
    }

    events.push({
      id: `ca-forward-evidence-${row.date}`,
      type: "FORWARD_EVIDENCE_RECORDED",
      domain: "execution",
      timestamp: row.dataCutoff,
      strategyId: "CA_CANDIDATE_V1",
      summary: `C-A shadow evidence recorded for ${row.date} — decision ${row.decision}.`,
      sourceDoc: "results/block10/ca-forward/daily-equity/ledger.jsonl",
    });

    if (row.decision === "ENTER") {
      events.push({
        id: `ca-shadow-entry-${row.date}`,
        type: "SHADOW_POSITION_OPENED",
        domain: "execution",
        timestamp: row.dataCutoff,
        strategyId: "CA_CANDIDATE_V1",
        summary: `C-A hypothetical shadow entry on ${row.date} at ${row.hypotheticalFillPrice} — no real order submitted.`,
        sourceDoc: "results/block10/ca-forward/daily-equity/ledger.jsonl",
      });
    } else if (row.decision === "EXIT") {
      events.push({
        id: `ca-shadow-exit-${row.date}`,
        type: "SHADOW_POSITION_CLOSED",
        domain: "execution",
        timestamp: row.dataCutoff,
        strategyId: "CA_CANDIDATE_V1",
        summary: `C-A hypothetical shadow exit on ${row.date} at ${row.hypotheticalFillPrice}, dailyPnlPct=${(row.dailyPnlPct * 100).toFixed(2)}% — no real order submitted.`,
        sourceDoc: "results/block10/ca-forward/daily-equity/ledger.jsonl",
      });
    } else if (row.decision === "BLOCKED") {
      events.push({
        id: `ca-shadow-blocked-${row.date}`,
        type: "SHADOW_BLOCKED",
        domain: "guard",
        timestamp: row.dataCutoff,
        strategyId: "CA_CANDIDATE_V1",
        summary: `C-A shadow evaluation blocked on ${row.date} — ${row.guardResult.violations.map((v) => v.guard).join(", ") || "unspecified guard"}.`,
        sourceDoc: "results/block10/ca-forward/daily-equity/ledger.jsonl",
      });
    } else if (row.signal?.triggered) {
      events.push({
        id: `ca-signal-${row.date}`,
        type: "STRATEGY_SIGNAL",
        domain: "signal",
        timestamp: row.dataCutoff,
        strategyId: "CA_CANDIDATE_V1",
        summary: `C-A canonical signal triggered on ${row.date} (decision: ${row.decision}).`,
        sourceDoc: "results/block10/ca-forward/daily-equity/ledger.jsonl",
      });
    }
  });

  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
