/**
 * Block 6, forward-testing evidence — the ONLY writer of
 * `results/block6/forward/ledger.jsonl`, one JSON object per line,
 * APPEND-ONLY (never rewritten/edited in place, matching the spec's
 * "registro append-only de forward evidence"). Deliberately separate from
 * `results/block6/paper/events.log` (the internal step-by-step audit
 * trail) and from anything under `results/block6/candidate/**` or the
 * Block 5 backtest results — this file is PAPER FORWARD evidence only,
 * never retroactively merged into the dataset that justified
 * `RS3M_CANDIDATE_V1`'s freeze.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ForwardEvidenceRecord } from "@/core/paper-trading/rs3m/forward-evidence";

const FORWARD_DIR = join(process.cwd(), "results", "block6", "forward");
const LEDGER_PATH = join(FORWARD_DIR, "ledger.jsonl");

export function appendForwardEvidence(record: ForwardEvidenceRecord): void {
  mkdirSync(FORWARD_DIR, { recursive: true });
  appendFileSync(LEDGER_PATH, `${JSON.stringify(record)}\n`);
}

/** Reads every ledger row back, oldest first — used by `forward-performance.ts` callers and any future reporting/reconciliation script. Returns `[]` if the ledger doesn't exist yet (never throws on "no forward evidence collected so far"). */
export function readForwardEvidenceLedger(): ForwardEvidenceRecord[] {
  if (!existsSync(LEDGER_PATH)) return [];
  const raw = readFileSync(LEDGER_PATH, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ForwardEvidenceRecord);
}
