/**
 * Block 10 §7/§13/§21 — the ONLY writer of C-A's forward-evidence
 * ledgers, under `results/block10/ca-forward/{signals,positions,fills,
 * daily-equity,activity}/ledger.jsonl` — one JSON object per line,
 * APPEND-ONLY, one directory per §7 evidence category (mirrors
 * `results/block6/paper/forward-evidence-store.ts`'s single-ledger
 * pattern, split across categories). Never mixed with backtest data or
 * Block 9.y's verification results.
 *
 * There is deliberately NO separate mutable "current state" file: the
 * shadow engine's `ShadowPriorState` (position, entry price/date, shadow
 * equity, last processed date) is always reconstructed by reading back
 * the LAST row of `daily-equity/ledger.jsonl` — the append-only ledger is
 * the single source of truth, so a crash mid-run can never leave a stale
 * cache out of sync with the evidence it's supposed to summarize. This is
 * also what makes idempotency (§13) durable across restarts: `todayDate
 * === lastProcessedDate` is checked against a value read from durable,
 * already-fsynced-by-appendFileSync storage, not an in-memory variable.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { INITIAL_SHADOW_STATE, type ShadowPriorState } from "@/core/ca-shadow/shadow-engine";
import { computeCaMonthlySummaries, type CaForwardEvidenceRecord, type CaMonthlySummary } from "@/core/ca-shadow/forward-evidence";

const BASE_DIR = join(process.cwd(), "results", "block10", "ca-forward");

export type CaEvidenceCategory = "signals" | "positions" | "fills" | "daily-equity" | "activity";

function ledgerPath(category: CaEvidenceCategory): string {
  return join(BASE_DIR, category, "ledger.jsonl");
}

function appendLedger(category: CaEvidenceCategory, record: CaForwardEvidenceRecord): void {
  const dir = join(BASE_DIR, category);
  mkdirSync(dir, { recursive: true });
  appendFileSync(ledgerPath(category), `${JSON.stringify(record)}\n`);
}

/** Reads one category's ledger back, oldest first. Returns `[]` if it doesn't exist yet — never throws on "no forward evidence collected so far." */
export function readCaForwardLedger(category: CaEvidenceCategory): CaForwardEvidenceRecord[] {
  const path = ledgerPath(category);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CaForwardEvidenceRecord);
}

/**
 * Appends one shadow-day result to every applicable ledger. `signals`,
 * `daily-equity`, and `activity` receive EVERY processed day, including
 * BLOCKED days (a blocked day is still evidence, never dropped — mirrors
 * RS3M's `ForwardEvidenceFinalState` precedent of never discarding a
 * blocked attempt). `positions`/`fills` receive only days with an actual
 * position transition (ENTER/EXIT) — a HOLD or BLOCKED day has no fill.
 */
export function appendCaForwardEvidence(record: CaForwardEvidenceRecord): void {
  appendLedger("signals", record);
  appendLedger("daily-equity", record);
  appendLedger("activity", record);
  if (record.decision === "ENTER" || record.decision === "EXIT") {
    appendLedger("positions", record);
    appendLedger("fills", record);
  }
}

/** §7's "monthly-summary" category — a computed view over `daily-equity`, not a separately stored ledger. See `forward-evidence.ts#computeCaMonthlySummaries` for why. */
export function readCaMonthlySummaries(): CaMonthlySummary[] {
  return computeCaMonthlySummaries(readCaForwardLedger("daily-equity"));
}

/**
 * Reconstructs the shadow engine's `ShadowPriorState` from the
 * `daily-equity` ledger — the durable, idempotency-relevant "current
 * state" read the daily routine script must perform before calling
 * `evaluateShadowDay` again. Returns `INITIAL_SHADOW_STATE` when no
 * forward evidence has been recorded yet (first-ever run).
 *
 * Deliberately skips trailing `BLOCKED` rows: `evaluateShadowDay` itself
 * never advances `lastProcessedDate` on a block (`newState: priorState`,
 * §14 — "si falla: no actualizar posición"), specifically so a date that
 * failed a transient guard (e.g. `DATA_STALE`) can be legitimately
 * retried once the underlying problem is fixed, without idempotency
 * treating it as already handled. Reconstructing state from the ledger
 * must reproduce that exact semantics, not merely "the last row."
 */
export function readLastShadowState(): ShadowPriorState {
  const rows = readCaForwardLedger("daily-equity");
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.decision === "BLOCKED") continue;
    return {
      position: row.positionAfter,
      entryPrice: row.entryPriceAfter,
      entryDate: row.entryDateAfter,
      shadowEquity: row.shadowEquityAfter,
      lastProcessedDate: row.date,
    };
  }
  return INITIAL_SHADOW_STATE;
}
