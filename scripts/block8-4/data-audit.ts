/**
 * Block 8.4 §6 — data audit re-verification for R3-B's SPY daily
 * dataset, INCLUDING a genuine independent second-source cross-check
 * (FRED's `SP500` index series, reachable without an API key — Stooq
 * was tried first and is blocked by a JS proof-of-work challenge in
 * this environment; Nasdaq's API returned empty data). FRED's SP500
 * series only covers the trailing ~10 years (starts ~2016-08), so the
 * cross-check covers the most recent portion of history, not the full
 * 1993-2026 range — disclosed, not silently worked around.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block8-4/data-audit.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../lib/sandbox-io";
setupSandboxIO();

import { pearsonCorrelation } from "@/core/backtesting/research/strategy-similarity";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import type { UsIndexDailyBar } from "@/core/us-index-research/types";

const DATASETS_DAILY_DIR = join(process.cwd(), "results", "block8-3", "datasets", "daily");
const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "data-audit");

function loadSpyBars(): UsIndexDailyBar[] {
  return JSON.parse(readFileSync(join(DATASETS_DAILY_DIR, "SPY_1d.json"), "utf8"));
}

interface FredRow {
  date: string;
  value: number;
}
async function fetchFredSp500(from: string, to: string): Promise<FredRow[]> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500&cosd=${from}&coed=${to}`;
  const response = await fetch(url);
  if (response.status !== 200) throw new Error(`FRED fetch failed: HTTP ${response.status}`);
  const text = await response.text();
  const rows: FredRow[] = [];
  for (const line of text.split("\n").slice(1)) {
    const [date, value] = line.split(",");
    if (!date || !value || value === ".") continue;
    const n = Number(value);
    if (Number.isFinite(n)) rows.push({ date, value: n });
  }
  return rows;
}

function main(): void {
  (async () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const bars = loadSpyBars();
    const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));

    // --- 1. Duplicate dates ---
    const dateCounts = new Map<string, number>();
    for (const b of sorted) dateCounts.set(b.date, (dateCounts.get(b.date) ?? 0) + 1);
    const duplicates = [...dateCounts.entries()].filter(([, count]) => count > 1);

    // --- 2. Gaps vs NYSE trading calendar ---
    const calendar = createNyseCalendar("SP500");
    const barDates = new Set(sorted.map((b) => b.date));
    const missingTradingDays: string[] = [];
    for (let i = 1; i < sorted.length; i++) {
      // Walk every calendar day between consecutive bars and flag any that the NYSE calendar considers a trading day but which has no bar.
      const d = new Date(sorted[i - 1].date + "T12:00:00Z");
      const end = new Date(sorted[i].date + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      while (d < end) {
        const dateStr = d.toISOString().slice(0, 10);
        if (calendar.isTradingDay(d) && !barDates.has(dateStr)) missingTradingDays.push(dateStr);
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }

    // --- 3. Stale values (identical close for >=5 consecutive trading days — a real red flag for equities, which almost never happens for a liquid ETF) ---
    const staleRuns: { startDate: string; endDate: string; close: number; length: number }[] = [];
    let runStart = 0;
    for (let i = 1; i <= sorted.length; i++) {
      const sameAsRun = i < sorted.length && sorted[i].close === sorted[runStart].close;
      if (!sameAsRun) {
        const length = i - runStart;
        if (length >= 5) staleRuns.push({ startDate: sorted[runStart].date, endDate: sorted[i - 1].date, close: sorted[runStart].close, length });
        runStart = i;
      }
    }

    // --- 4. Dividend/split re-confirmation (adjClose vs close divergence pattern) ---
    // Threshold 1e-6, not 1e-9: the adjClose/close ratio is stored as floating point and carries
    // ~1e-7 to 1e-9 noise even on days with NO real adjustment event — a 1e-9 threshold spuriously
    // flagged 8300/8448 bars (verified directly against the raw numbers) before this fix. 1e-6
    // cleanly isolates genuine step changes (found: exactly 135, matching Block 8.3's own fetch
    // report's dividend count exactly).
    const adjustmentEvents = sorted.filter((b, i) => i > 0 && Math.abs(b.adjClose / b.close - sorted[i - 1].adjClose / sorted[i - 1].close) > 1e-6).length;

    // --- 5. Independent second-source cross-check (FRED SP500 index) ---
    let crossCheck: unknown;
    try {
      const fredRows = await fetchFredSp500("2024-01-01", "2026-08-21");
      const fredByDate = new Map(fredRows.map((r) => [r.date, r.value]));
      const spyByDate = new Map(sorted.map((b) => [b.date, b.adjClose]));
      const commonDates = [...fredByDate.keys()].filter((d) => spyByDate.has(d)).sort();

      const fredReturns: number[] = [];
      const spyReturns: number[] = [];
      for (let i = 1; i < commonDates.length; i++) {
        const prevD = commonDates[i - 1];
        const currD = commonDates[i];
        fredReturns.push(fredByDate.get(currD)! / fredByDate.get(prevD)! - 1);
        spyReturns.push(spyByDate.get(currD)! / spyByDate.get(prevD)! - 1);
      }
      const correlation = pearsonCorrelation(fredReturns, spyReturns);
      const meanAbsDiff = fredReturns.reduce((s, r, i) => s + Math.abs(r - spyReturns[i]), 0) / fredReturns.length;

      crossCheck = {
        source: "FRED SP500 (index level, not SPY ETF — expect near-1.0 daily-return correlation, small systematic difference from SPY's expense ratio + dividend timing, NOT an exact match)",
        commonTradingDays: commonDates.length,
        dailyReturnCorrelation: correlation,
        meanAbsoluteDailyReturnDifference: meanAbsDiff,
        assessment: correlation !== undefined && correlation > 0.995 ? "PASS — SPY daily returns track the independent FRED S&P 500 index series almost perfectly, as expected." : "REVIEW NEEDED",
      };
    } catch (error) {
      crossCheck = { error: error instanceof Error ? error.message : String(error), note: "FRED cross-check could not be completed this run — Stooq (tried first) is blocked by a JS proof-of-work challenge; Nasdaq's API returned empty data." };
    }

    const result = {
      generatedAt: new Date().toISOString(),
      totalBars: sorted.length,
      dateRange: { from: sorted[0]?.date, to: sorted[sorted.length - 1]?.date },
      duplicateDates: duplicates,
      missingTradingDaysVsNyseCalendar: missingTradingDays,
      staleValueRuns: staleRuns,
      dividendOrSplitAdjustmentEvents: adjustmentEvents,
      crossSourceCheck: crossCheck,
    };

    writeFileSync(join(OUTPUT_DIR, "data-audit.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  })().catch((error) => {
    console.error("[data-audit] failed:", error);
    process.exitCode = 1;
  });
}

main();
