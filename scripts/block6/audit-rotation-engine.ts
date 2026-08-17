/**
 * Block 6, Fase 2 — independent audit of the Relative Strength rotation
 * engine (`src/core/backtesting/research/relative-strength.ts`), which
 * had far less scrutiny in Block 5 than the trade-based intraday engine
 * did in Block 4.5. This script does NOT modify the engine — it re-runs
 * it against real data under two price-adjustment settings and reports
 * findings, including the one the exploration already surfaced: Block 5's
 * whole Relative Strength result was computed on RAW (unadjusted-for-
 * dividends) prices, because `alpaca.adapter.ts` never set the
 * `adjustment` query param before this block.
 *
 * ============================================================
 * DOCUMENTED PIPELINE: data cutoff -> signal -> order -> execution
 * ============================================================
 * 1. DATA CUTOFF: the close of the LAST TRADING DAY of each calendar
 *    month (the last daily candle with that month's key), using only
 *    candles with a timestamp <= that close.
 * 2. SIGNAL: the ranking of all 4 universe assets by trailing
 *    `lookbackMonths`-month total return, computed AT that cutoff close.
 *    The signal's timestamp = the cutoff close itself.
 * 3. ORDER: planned for the OPEN of the NEXT trading session following
 *    the cutoff close — never the same close that generated the signal.
 *    This is a documented, DELIBERATE deviation from the Block 5
 *    backtest's own assumption, which effectively treated the decision
 *    close and the execution price as the same bar (see `holdMonth`'s
 *    `periodReturnPct`, computed close-to-close). Block 6's ledger
 *    (Fase 3) and paper-trading path (Fase 16+) use the more realistic
 *    next-session-open convention instead; this script quantifies how
 *    much of a difference remains between the two conventions is a
 *    separate, execution-timing finding, NOT re-litigated here (see the
 *    ledger's own price series for that comparison).
 * 4. EXECUTION: theoretical fill at that next session's real open price.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block6/audit-rotation-engine.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../lib/sandbox-io";
setupSandboxIO();

import { fetchRs3mUniverse, RS3M_BENCHMARK, RS3M_LONG_HISTORY_FROM, RS3M_UNIVERSE } from "./lib/fetch-candidate-assets";
import { runRelativeStrengthBacktest, monthKey, type RelativeStrengthAssetInput, type RelativeStrengthRunResult } from "@/core/backtesting/research/relative-strength";
import { RS3M_CANDIDATE_V1, computeCandidateHash } from "@/core/paper-trading/rs3m/candidate";
import type { Candle } from "@/core/market-data/types";
import type { Market } from "@/core/shared/types";

const OUTPUT_DIR = join(process.cwd(), "results", "block6", "audit");

function toAssetInputs(byMarket: Map<Market, Candle[]>): RelativeStrengthAssetInput[] {
  return RS3M_UNIVERSE.map((market) => ({ market, candles: byMarket.get(market)! }));
}

function summarizeRun(run: RelativeStrengthRunResult) {
  return {
    totalReturnPct: run.totalReturnPct,
    cagrPct: run.cagrPct,
    maxDrawdownPct: run.maxDrawdownPct,
    sharpeRatio: run.sharpeRatio,
    monthsTraded: run.monthsTraded,
    finalStrategyEquity: run.strategyEquityCurve.at(-1)?.equity,
    finalBenchmarkEquity: run.benchmarkEquityCurve.at(-1)?.equity,
    finalEqualWeightEquity: run.equalWeightEquityCurve.at(-1)?.equity,
    switchCount: run.periods.filter((p, i) => i === 0 || p.selectedMarket !== run.periods[i - 1].selectedMarket).length,
  };
}

/** Reports any calendar month, within each asset's own observed range, for which NO candle exists at all — a genuine data gap, distinct from "the asset just didn't trade that day" (daily bars only miss a whole month if the feed itself has a hole). */
function findMissingMonths(byMarket: Map<Market, Candle[]>): Record<string, string[]> {
  const missing: Record<string, string[]> = {};
  for (const [market, candles] of byMarket) {
    const months = new Set(candles.map((c) => monthKey(c.timestamp)));
    const sorted = [...months].sort();
    const gaps: string[] = [];
    if (sorted.length > 1) {
      let cursor = new Date(`${sorted[0]}-01T00:00:00.000Z`);
      const end = new Date(`${sorted[sorted.length - 1]}-01T00:00:00.000Z`);
      while (cursor < end) {
        const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
        if (!months.has(key)) gaps.push(key);
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      }
    }
    if (gaps.length > 0) missing[market] = gaps;
  }
  return missing;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`[audit-rotation-engine] Candidate: ${RS3M_CANDIDATE_V1.candidateId} v${RS3M_CANDIDATE_V1.version} (hash=${computeCandidateHash(RS3M_CANDIDATE_V1)})`);
  console.log("[audit-rotation-engine] Fetching RAW (unset adjustment, replicates Block 5 exactly) daily candles 2016-present...");
  const rawByMarket = await fetchRs3mUniverse(undefined, RS3M_LONG_HISTORY_FROM);
  console.log("[audit-rotation-engine] Fetching ADJUSTED (adjustment=all — splits + dividends) daily candles 2016-present...");
  const adjustedByMarket = await fetchRs3mUniverse("all", RS3M_LONG_HISTORY_FROM);

  if (!rawByMarket || !adjustedByMarket) {
    console.error("[audit-rotation-engine] Could not fetch both datasets — aborting.");
    process.exitCode = 1;
    return;
  }

  const config = { lookbackMonths: RS3M_CANDIDATE_V1.lookbackMonths, benchmarkMarket: RS3M_BENCHMARK, rebalanceCostBps: RS3M_CANDIDATE_V1.referenceRebalanceCostBps };

  const rawRun = runRelativeStrengthBacktest(toAssetInputs(rawByMarket), config);
  const adjustedRun = runRelativeStrengthBacktest(toAssetInputs(adjustedByMarket), config);

  const rawSummary = summarizeRun(rawRun);
  const adjustedSummary = summarizeRun(adjustedRun);

  // Rebalance-by-rebalance selection diff — where does adjustment actually change which asset wins?
  const selectionDiffs: { decisionMonth: string; rawSelected: string | undefined; adjustedSelected: string | undefined }[] = [];
  const maxLen = Math.max(rawRun.periods.length, adjustedRun.periods.length);
  for (let i = 0; i < maxLen; i++) {
    const r = rawRun.periods[i];
    const a = adjustedRun.periods[i];
    if (r?.selectedMarket !== a?.selectedMarket || r?.decisionMonth !== a?.decisionMonth) {
      selectionDiffs.push({ decisionMonth: a?.decisionMonth ?? r?.decisionMonth ?? "?", rawSelected: r?.selectedMarket, adjustedSelected: a?.selectedMarket });
    }
  }

  const missingMonthsRaw = findMissingMonths(rawByMarket);
  const missingMonthsAdjusted = findMissingMonths(adjustedByMarket);

  const report = {
    generatedAt: new Date().toISOString(),
    candidateId: RS3M_CANDIDATE_V1.candidateId,
    candidateVersion: RS3M_CANDIDATE_V1.version,
    candidateHash: computeCandidateHash(RS3M_CANDIDATE_V1),
    datasetFrom: RS3M_LONG_HISTORY_FROM,
    universe: RS3M_UNIVERSE,
    benchmark: RS3M_BENCHMARK,
    referenceRebalanceCostBps: RS3M_CANDIDATE_V1.referenceRebalanceCostBps,
    pipeline: {
      dataCutoff: "Close of the last trading day of each calendar month; only candles with timestamp <= that close are used.",
      signal: "Ranking of all 4 universe assets by trailing lookbackMonths total return, computed AT the cutoff close. Signal timestamp = cutoff close.",
      order: "Planned for the OPEN of the NEXT trading session after the cutoff close — never the same close (see Fase 3 ledger for the real next-session-open price series).",
      execution: "Theoretical fill at that next session's real open price.",
      deviationFromBlock5Backtest:
        "The Block 5 backtest computed periodReturnPct close-to-close within runRelativeStrengthBacktest — an implicit same-close-fill simplification. Block 6's ledger/paper-trading path uses the more realistic next-session-open convention documented above; this is a KNOWN, DOCUMENTED difference, not a bug being silently patched into the frozen candidate's historical numbers.",
    },
    findings: {
      priceAdjustmentBug:
        "CONFIRMED (pre-existing, now fixed additively): alpaca.adapter.ts never set Alpaca's `adjustment` query param before Block 6, so Block 5's entire Relative Strength result was computed on RAW (unadjusted for splits/dividends) prices. This audit re-runs the identical candidate config under both settings — see rawVsAdjustedComparison below for the quantified difference.",
      lookAheadBias: "NOT FOUND. Verified via two dedicated unit tests in tests/core/backtesting/research/relative-strength.test.ts (Fase 2): (1) truncating all months after decision month T does not change period T's selection or return; (2) an adversarial future spike placed strictly after the decision month's close never influences that month's ranking.",
      missingDataRaw: Object.keys(missingMonthsRaw).length > 0 ? missingMonthsRaw : "NONE — every asset has a candle in every calendar month across its observed range (raw dataset).",
      missingDataAdjusted: Object.keys(missingMonthsAdjusted).length > 0 ? missingMonthsAdjusted : "NONE — every asset has a candle in every calendar month across its observed range (adjusted dataset).",
      cashHandling: "Confirmed by code inspection (relative-strength.ts): the engine is always 100% invested in the single selected asset (or 0% synthetic 'cash' realizing exactly 0% return when no asset has enough trailing history) — there is no partial-cash/leftover-capital state at any point.",
      resampling: "Confirmed correct: buildMonthlyCloses keeps the LAST candle seen per calendar month key, i.e. the actual last trading day's close — not a naive last-calendar-day-of-month lookup that could miss a weekend/holiday.",
      turnoverRaw: `${rawSummary.switchCount} asset switches across ${rawRun.periods.length} rebalances.`,
      turnoverAdjusted: `${adjustedSummary.switchCount} asset switches across ${adjustedRun.periods.length} rebalances.`,
    },
    rawVsAdjustedComparison: {
      raw: rawSummary,
      adjusted: adjustedSummary,
      cagrDeltaPp: adjustedSummary.cagrPct - rawSummary.cagrPct,
      totalReturnDeltaPp: adjustedSummary.totalReturnPct - rawSummary.totalReturnPct,
      selectionDiffs,
      selectionDiffCount: selectionDiffs.length,
      note:
        selectionDiffs.length === 0
          ? "The monthly asset SELECTION never differed between raw and adjusted prices — the ranking order was robust to dividend adjustment over this history. Only the realized cumulative return differs (dividends are extra return the raw/unadjusted series silently omits)."
          : `The monthly asset SELECTION differed on ${selectionDiffs.length} rebalance(s) between raw and adjusted prices — see selectionDiffs. This means part of Block 5's reported edge could be an artifact of using unadjusted prices for ranking, not just for realized return.`,
    },
  };

  writeFileSync(join(OUTPUT_DIR, "engine-audit-report.json"), JSON.stringify(report, null, 2));
  console.log(`\n=== Engine audit complete. Report at ${join(OUTPUT_DIR, "engine-audit-report.json")} ===`);
  console.log(`Raw CAGR: ${rawSummary.cagrPct.toFixed(2)}% | Adjusted CAGR: ${adjustedSummary.cagrPct.toFixed(2)}% | Delta: ${(adjustedSummary.cagrPct - rawSummary.cagrPct).toFixed(2)}pp`);
  console.log(`Selection diffs (raw vs adjusted): ${selectionDiffs.length}`);
}

main().catch((error) => {
  console.error("[audit-rotation-engine] Unhandled error:", error);
  process.exitCode = 1;
});
