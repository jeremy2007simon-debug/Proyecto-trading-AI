/**
 * Block 10.1 §12/§13 — the Daily Close Report's OWN daily equity-mark
 * ledger for RS3M's Paper account. This is intentionally SEPARATE from
 * every file under `results/block6/**` and from
 * `src/core/paper-trading/rs3m/**` — RS3M's own forward-evidence ledger
 * only gains a row on a dry-run/rebalance ATTEMPT (roughly once per
 * decision month, plus daily STALE_SIGNAL rows for part of the month),
 * never a genuine once-per-trading-day equity mark. Computing a daily
 * P&L for the report requires a value to diff against every single
 * trading day, so the report engine keeps its own append-only record of
 * "what RS3M's live Paper equity was, the last time the report ran" —
 * built ONLY from the EXISTING, already-read-only `getAccount()` call
 * (via `getNovaCorePortfolioSnapshot()`), never a new broker method and
 * never a write to RS3M's own state.
 *
 * One JSON object per line, chronological, append-only — same pattern as
 * every other Block 10 ledger.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Rs3mEquityMark {
  date: string; // YYYY-MM-DD, the trading date this mark represents
  equityUsd: number;
  cashUsd: number;
  recordedAt: string; // ISO instant this mark was actually read from the broker
}

const LEDGER_PATH = join(process.cwd(), "results", "block10", "daily-reports", "rs3m-equity-marks.jsonl");

export function readRs3mEquityMarks(): Rs3mEquityMark[] {
  if (!existsSync(LEDGER_PATH)) return [];
  return readFileSync(LEDGER_PATH, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Rs3mEquityMark);
}

/** Appends one mark. Idempotency (never two marks for the same date) is the CALLER's responsibility — see `aggregate-daily-close-report.ts`, which only calls this once per date, after checking `readRs3mEquityMarks()` for an existing row. */
export function appendRs3mEquityMark(mark: Rs3mEquityMark): void {
  const dir = join(process.cwd(), "results", "block10", "daily-reports");
  mkdirSync(dir, { recursive: true });
  appendFileSync(LEDGER_PATH, `${JSON.stringify(mark)}\n`);
}
