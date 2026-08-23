import type { ShadowDayResult } from "@/core/ca-shadow/shadow-engine";

/**
 * Block 10 §7 — the append-only forward-evidence record schema for C-A's
 * shadow engine. `ShadowDayResult` (built by `evaluateShadowDay` in
 * `shadow-engine.ts`) already carries every field §7 requires — timestamp
 * (via `date`/`dataCutoff`), candidate id, candidate hash, data cutoff,
 * signal (percentile value/rank via `signal.percentileThreshold`/
 * `percentileRank`), entry/exit decision, theoretical price, hypothetical
 * fill price, cost assumption, position before/after, shadow equity, SPY
 * benchmark, errors/warnings — so the evidence record IS the day result,
 * not a second, hand-duplicated shape (§21: "never manually duplicate
 * data that can be read from its source").
 */
export type CaForwardEvidenceRecord = ShadowDayResult;

export interface CaMonthlySummary {
  month: string; // YYYY-MM
  startEquity: number;
  endEquity: number;
  monthlyReturnPct: number;
  trades: number;
  daysProcessed: number;
  blockedDays: number;
}

/**
 * §7's "monthly-summary" evidence category is a COMPUTED VIEW over the
 * `daily-equity` ledger, not a separately stored/duplicated ledger — a
 * monthly summary appended once and never revisited would either need
 * risky in-place rewriting (violating append-only) or would go stale the
 * moment a late/corrected daily row lands. Recomputing it on read from
 * the append-only source is both simpler and strictly more correct.
 */
export function computeCaMonthlySummaries(dailyEquityRows: readonly CaForwardEvidenceRecord[]): CaMonthlySummary[] {
  const byMonth = new Map<string, CaForwardEvidenceRecord[]>();
  for (const row of dailyEquityRows) {
    const month = row.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(row);
  }
  return [...byMonth.keys()].sort().map((month) => {
    const rows = byMonth.get(month)!;
    const startEquity = rows[0].shadowEquityBefore;
    const endEquity = rows[rows.length - 1].shadowEquityAfter;
    return {
      month,
      startEquity,
      endEquity,
      monthlyReturnPct: startEquity > 0 ? (endEquity / startEquity - 1) * 100 : 0,
      trades: rows.filter((r) => r.decision === "ENTER").length,
      daysProcessed: rows.length,
      blockedDays: rows.filter((r) => r.decision === "BLOCKED").length,
    };
  });
}
