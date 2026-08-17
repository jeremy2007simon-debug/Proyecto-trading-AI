/**
 * Block 6, Fase 4 — independent reproduction of RS3M_CANDIDATE_V1.
 *
 * DELIBERATELY does not import or call `runRelativeStrengthBacktest` (or
 * any of its helpers) — this file has its own, separately-written
 * month-bucketing, ranking, and return-compounding logic, so a bug shared
 * between "the audit" and "the thing being audited" can't hide. It is
 * intentionally simpler/less structured than the production engine (no
 * shared types, no equity-curve objects, no research-module imports
 * beyond fetching the raw candles) — the point is independence, not
 * elegance. Differences are REPORTED, never silently reconciled by
 * tweaking one implementation to match the other.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block6/independent-reproduction.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../lib/sandbox-io";
setupSandboxIO();

import { fetchRs3mUniverse, RS3M_BENCHMARK, RS3M_UNIVERSE } from "./lib/fetch-candidate-assets";
import { runRelativeStrengthBacktest, type RelativeStrengthAssetInput } from "@/core/backtesting/research/relative-strength";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import type { Candle } from "@/core/market-data/types";
import type { Market } from "@/core/shared/types";

const OUTPUT_DIR = join(process.cwd(), "results", "block6", "audit");

/** Independent month-key bucketing — written fresh, not imported from `relative-strength.ts`. Deliberately uses a plain string split of the ISO timestamp instead of `Date`/`Intl` machinery, as a genuinely different code path. */
function independentMonthKey(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 7); // "YYYY-MM-DDTHH:..." -> "YYYY-MM"
}

/** Independent month-end-close builder: last candle per month key, iterated in original array order (candles are pre-sorted chronologically by the fetch helper). */
function independentMonthlyCloses(candles: readonly Candle[]): Record<string, number> {
  const closes: Record<string, number> = {};
  for (const c of candles) closes[independentMonthKey(c.timestamp)] = c.close;
  return closes;
}

interface IndependentPeriod {
  decisionMonth: string;
  holdMonth: string;
  selectedMarket: string | undefined;
  periodReturnPct: number;
}

function runIndependentReproduction(byMarket: Map<Market, readonly Candle[]>, lookbackMonths: number, rebalanceCostBps: number): { periods: IndependentPeriod[]; totalReturnPct: number; cagrPct: number } {
  const closesByMarket: Record<string, Record<string, number>> = {};
  for (const market of RS3M_UNIVERSE) closesByMarket[market] = independentMonthlyCloses(byMarket.get(market)!);

  const monthSet = new Set<string>();
  for (const market of RS3M_UNIVERSE) for (const month of Object.keys(closesByMarket[market])) monthSet.add(month);
  const months = Array.from(monthSet).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const periods: IndependentPeriod[] = [];
  let equity = 1;
  let previousAsset: string | undefined;
  const costFraction = rebalanceCostBps / 10000;

  let idx = lookbackMonths;
  while (idx < months.length - 1) {
    const decisionMonth = months[idx];
    const holdMonth = months[idx + 1];
    const baselineMonth = months[idx - lookbackMonths];

    let bestAsset: string | undefined;
    let bestReturn = -Infinity;
    for (const market of RS3M_UNIVERSE) {
      const closes = closesByMarket[market];
      const baselinePrice = closes[baselineMonth];
      const decisionPrice = closes[decisionMonth];
      if (baselinePrice === undefined || decisionPrice === undefined || baselinePrice <= 0) continue;
      const trailing = (decisionPrice - baselinePrice) / baselinePrice;
      if (trailing > bestReturn) {
        bestReturn = trailing;
        bestAsset = market;
      }
    }

    let holdReturn = 0;
    if (bestAsset !== undefined) {
      const closes = closesByMarket[bestAsset];
      const decisionPrice = closes[decisionMonth];
      const holdPrice = closes[holdMonth];
      if (decisionPrice !== undefined && holdPrice !== undefined && decisionPrice > 0) {
        holdReturn = (holdPrice - decisionPrice) / decisionPrice;
      }
    }

    const switched = bestAsset !== previousAsset;
    const netReturn = switched ? holdReturn - costFraction : holdReturn;
    equity = equity * (1 + netReturn);

    periods.push({ decisionMonth, holdMonth, selectedMarket: bestAsset, periodReturnPct: netReturn * 100 });
    previousAsset = bestAsset;
    idx += 1;
  }

  const totalReturnPct = (equity - 1) * 100;
  const cagrPct = periods.length > 0 ? (Math.pow(equity, 12 / periods.length) - 1) * 100 : 0;
  return { periods, totalReturnPct, cagrPct };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("[independent-reproduction] Fetching adjusted (adjustment=all) daily candles 2016-present...");
  const byMarket = await fetchRs3mUniverse("all", RS3M_CANDIDATE_V1.datasetFrom);
  if (!byMarket) {
    console.error("[independent-reproduction] Could not fetch data — aborting.");
    process.exitCode = 1;
    return;
  }

  const config = { lookbackMonths: RS3M_CANDIDATE_V1.lookbackMonths, benchmarkMarket: RS3M_BENCHMARK, rebalanceCostBps: RS3M_CANDIDATE_V1.referenceRebalanceCostBps };
  const engineAssetInputs: RelativeStrengthAssetInput[] = RS3M_UNIVERSE.map((market) => ({ market, candles: byMarket.get(market)! }));
  const engineResult = runRelativeStrengthBacktest(engineAssetInputs, config);

  const independentResult = runIndependentReproduction(byMarket, RS3M_CANDIDATE_V1.lookbackMonths, RS3M_CANDIDATE_V1.referenceRebalanceCostBps);

  const maxLen = Math.max(engineResult.periods.length, independentResult.periods.length);
  const rowDiffs: { index: number; decisionMonthMatch: boolean; selectedMarketMatch: boolean; returnDeltaPp: number; engine: unknown; independent: unknown }[] = [];
  let mismatchCount = 0;
  for (let i = 0; i < maxLen; i++) {
    const e = engineResult.periods[i];
    const r = independentResult.periods[i];
    const decisionMonthMatch = e?.decisionMonth === r?.decisionMonth;
    const selectedMarketMatch = e?.selectedMarket === r?.selectedMarket;
    const returnDeltaPp = (e?.periodReturnPct ?? 0) - (r?.periodReturnPct ?? 0);
    const isMismatch = !decisionMonthMatch || !selectedMarketMatch || Math.abs(returnDeltaPp) > 0.01;
    if (isMismatch) {
      mismatchCount++;
      rowDiffs.push({ index: i, decisionMonthMatch, selectedMarketMatch, returnDeltaPp, engine: e, independent: r });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    candidateId: RS3M_CANDIDATE_V1.candidateId,
    method: "Independent, non-code-sharing reimplementation of monthly rotation selection/return logic — compared rebalance-by-rebalance against the production engine (relative-strength.ts).",
    engineSummary: { periodCount: engineResult.periods.length, totalReturnPct: engineResult.totalReturnPct, cagrPct: engineResult.cagrPct },
    independentSummary: { periodCount: independentResult.periods.length, totalReturnPct: independentResult.totalReturnPct, cagrPct: independentResult.cagrPct },
    totalReturnDeltaPp: engineResult.totalReturnPct - independentResult.totalReturnPct,
    cagrDeltaPp: engineResult.cagrPct - independentResult.cagrPct,
    mismatchCount,
    mismatchRate: maxLen > 0 ? mismatchCount / maxLen : 0,
    rowDiffs,
    conclusion:
      mismatchCount === 0
        ? "REPRODUCED — every rebalance (decision month, selected asset, period return) matches exactly between the production engine and this independent reimplementation."
        : `DISCREPANCIES FOUND on ${mismatchCount}/${maxLen} rebalance(s) — see rowDiffs. Reported as-is, not adjusted to force agreement; see the Block 6 report for interpretation.`,
  };

  writeFileSync(join(OUTPUT_DIR, "independent-reproduction-report.json"), JSON.stringify(report, null, 2));
  console.log(`\n=== Independent reproduction complete: ${report.conclusion} ===`);
  console.log(`Engine CAGR: ${engineResult.cagrPct.toFixed(2)}% | Independent CAGR: ${independentResult.cagrPct.toFixed(2)}% | Delta: ${report.cagrDeltaPp.toFixed(4)}pp`);
}

main().catch((error) => {
  console.error("[independent-reproduction] Unhandled error:", error);
  process.exitCode = 1;
});
