/**
 * Block 6, Fase 3 — rebalance-by-rebalance ledger for RS3M_CANDIDATE_V1.
 *
 * Deliberately walks its OWN monthly decision loop (not calling
 * `runRelativeStrengthBacktest` for the per-row detail, though it uses
 * the same `buildMonthlyCloses`/`monthKey` helpers for the SIGNAL side to
 * stay consistent with the audited engine) so it can attach real,
 * dedicated data the engine's own return value doesn't carry: the exact
 * signal-close timestamp, the real next-trading-session's open price
 * (execution price under the documented next-open convention — see
 * `audit-rotation-engine.ts`'s pipeline doc), share/notional sizing, and
 * running portfolio value.
 *
 * Uses the ADJUSTED (adjustment="all") dataset — RS3M_CANDIDATE_V1's own
 * `priceAdjustment` — since this ledger represents the OFFICIAL,
 * as-verified-in-Block-6 record of the candidate, not a replica of
 * Block 5's original (raw-price) run.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block6/generate-rebalance-ledger.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../lib/sandbox-io";
setupSandboxIO();

import { fetchRs3mUniverse, RS3M_BENCHMARK, RS3M_UNIVERSE } from "./lib/fetch-candidate-assets";
import { monthKey, buildMonthlyCloses } from "@/core/backtesting/research/relative-strength";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import type { Candle } from "@/core/market-data/types";
import type { Market } from "@/core/shared/types";

const OUTPUT_DIR = join(process.cwd(), "results", "block6", "ledger");
const STARTING_NOTIONAL = 10_000; // arbitrary reference portfolio size — the ledger reports PERCENTAGE-based P&L/turnover regardless, this only makes the notional/shares columns concrete.

interface LedgerRow {
  rebalanceIndex: number;
  decisionMonth: string;
  holdMonth: string;
  signalCloseTimestamp: string;
  dataAvailableThroughTimestamp: string;
  ranking: { market: string; trailingReturnPct: number }[];
  previousAsset: string | undefined;
  selectedAsset: string | undefined;
  isRebalance: boolean;
  signalClosePrice: number | undefined;
  executionTimestamp: string | undefined;
  executionOpenPrice: number | undefined;
  sharesTraded: number | undefined;
  notionalTraded: number | undefined;
  portfolioValueBeforeRebalance: number;
  portfolioValueAfterHoldMonth: number;
  turnoverPct: number;
  rebalanceCostDollar: number;
  periodPnlDollar: number;
  periodPnlPct: number;
  benchmarkSpyReturnPct: number | undefined;
  equalWeightReturnPct: number | undefined;
}

/** Finds the FIRST candle strictly after `afterTimestamp` — the real next trading session's candle (open price = execution price under the documented convention). `undefined` if none exists yet (e.g. the most recent rebalance in a still-live series). */
function findNextSessionCandle(candles: readonly Candle[], afterTimestamp: string): Candle | undefined {
  return candles.find((c) => c.timestamp > afterTimestamp);
}

/** Finds the LAST candle within a given calendar month — the signal's data-cutoff close. */
function findMonthEndCandle(candles: readonly Candle[], month: string): Candle | undefined {
  let last: Candle | undefined;
  for (const c of candles) if (monthKey(c.timestamp) === month) last = c;
  return last;
}

function periodReturn(series: Map<string, number>, fromMonth: string, toMonth: string): number | undefined {
  const from = series.get(fromMonth);
  const to = series.get(toMonth);
  if (from === undefined || to === undefined || from <= 0) return undefined;
  return (to - from) / from;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("[generate-rebalance-ledger] Fetching adjusted (adjustment=all) daily candles 2016-present...");
  const byMarket = await fetchRs3mUniverse("all", RS3M_CANDIDATE_V1.datasetFrom);
  if (!byMarket) {
    console.error("[generate-rebalance-ledger] Could not fetch data — aborting.");
    process.exitCode = 1;
    return;
  }

  const monthlySeriesByMarket = new Map(RS3M_UNIVERSE.map((m) => [m, buildMonthlyCloses(byMarket.get(m)!)]));
  const allMonths = [...new Set(RS3M_UNIVERSE.flatMap((m) => [...monthlySeriesByMarket.get(m)!.keys()]))].sort();
  const rebalanceCostFraction = RS3M_CANDIDATE_V1.referenceRebalanceCostBps / 10_000;
  const lookbackMonths = RS3M_CANDIDATE_V1.lookbackMonths;

  const rows: LedgerRow[] = [];
  let portfolioValue = STARTING_NOTIONAL;
  let previousSelected: string | undefined;
  let rebalanceIndex = 0;

  for (let i = lookbackMonths; i < allMonths.length - 1; i++) {
    const decisionMonth = allMonths[i];
    const holdMonth = allMonths[i + 1];
    const lookbackStartMonth = allMonths[i - lookbackMonths];

    const ranking: { market: string; trailingReturnPct: number }[] = [];
    for (const market of RS3M_UNIVERSE) {
      const series = monthlySeriesByMarket.get(market)!;
      const trailingReturn = periodReturn(series, lookbackStartMonth, decisionMonth);
      if (trailingReturn !== undefined) ranking.push({ market, trailingReturnPct: trailingReturn * 100 });
    }
    ranking.sort((a, b) => b.trailingReturnPct - a.trailingReturnPct);
    const selected = ranking[0]?.market;

    const signalCandle = selected ? findMonthEndCandle(byMarket.get(selected as Market)!, decisionMonth) : undefined;
    const nextSessionCandle = signalCandle ? findNextSessionCandle(byMarket.get(selected as Market)!, signalCandle.timestamp) : undefined;

    const isRebalance = selected !== previousSelected;
    const portfolioValueBefore = portfolioValue;
    const sharesTraded = isRebalance && nextSessionCandle && nextSessionCandle.open > 0 ? portfolioValueBefore / nextSessionCandle.open : undefined;
    const notionalTraded = isRebalance ? portfolioValueBefore : undefined;
    const rebalanceCostDollar = isRebalance ? portfolioValueBefore * rebalanceCostFraction : 0;

    const grossReturn = selected ? (periodReturn(monthlySeriesByMarket.get(selected as Market)!, decisionMonth, holdMonth) ?? 0) : 0;
    // Matches the audited engine's own formula exactly (relative-strength.ts:
    // `realizedReturn = isRebalance ? grossReturn - rebalanceCostFraction : grossReturn`)
    // so this ledger's portfolio-value column is a faithful dollar-denominated
    // trace of the SAME arithmetic the engine's equity curve uses, not an
    // independently-derived approximation.
    const realizedReturn = grossReturn - (isRebalance ? rebalanceCostFraction : 0);
    const periodPnlPct = realizedReturn * 100;
    const portfolioValueAfter = portfolioValueBefore * (1 + realizedReturn);

    const spyReturn = periodReturn(monthlySeriesByMarket.get(RS3M_BENCHMARK)!, decisionMonth, holdMonth);
    const equalWeightReturns = RS3M_UNIVERSE.map((m) => periodReturn(monthlySeriesByMarket.get(m)!, decisionMonth, holdMonth)).filter((r): r is number => r !== undefined);
    const equalWeightReturn = equalWeightReturns.length > 0 ? equalWeightReturns.reduce((s, r) => s + r, 0) / equalWeightReturns.length : undefined;

    rows.push({
      rebalanceIndex: rebalanceIndex++,
      decisionMonth,
      holdMonth,
      signalCloseTimestamp: signalCandle?.timestamp ?? "N/A",
      dataAvailableThroughTimestamp: signalCandle?.timestamp ?? "N/A",
      ranking,
      previousAsset: previousSelected,
      selectedAsset: selected,
      isRebalance,
      signalClosePrice: signalCandle?.close,
      executionTimestamp: nextSessionCandle?.timestamp,
      executionOpenPrice: nextSessionCandle?.open,
      sharesTraded,
      notionalTraded,
      portfolioValueBeforeRebalance: portfolioValueBefore,
      portfolioValueAfterHoldMonth: portfolioValueAfter,
      turnoverPct: isRebalance ? 100 : 0,
      rebalanceCostDollar,
      periodPnlDollar: portfolioValueAfter - portfolioValueBefore,
      periodPnlPct,
      benchmarkSpyReturnPct: spyReturn !== undefined ? spyReturn * 100 : undefined,
      equalWeightReturnPct: equalWeightReturn !== undefined ? equalWeightReturn * 100 : undefined,
    });

    portfolioValue = portfolioValueAfter;
    previousSelected = selected;
  }

  // CSV
  const headers = Object.keys(rows[0] ?? {}).filter((k) => k !== "ranking");
  const csvLines = [
    [...headers, "ranking"].join(","),
    ...rows.map((row) =>
      [
        ...headers.map((h) => {
          const v = (row as unknown as Record<string, unknown>)[h];
          return v === undefined ? "" : typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : String(v);
        }),
        `"${row.ranking.map((r) => `${r.market}:${r.trailingReturnPct.toFixed(2)}%`).join("|").replace(/"/g, '""')}"`,
      ].join(","),
    ),
  ];
  writeFileSync(join(OUTPUT_DIR, "rs3m_rebalance_ledger.csv"), csvLines.join("\n"));
  writeFileSync(join(OUTPUT_DIR, "rs3m_rebalance_ledger.json"), JSON.stringify({ startingNotional: STARTING_NOTIONAL, rows }, null, 2));

  console.log(`\n=== Ledger complete: ${rows.length} rebalances. Output in ${OUTPUT_DIR} ===`);
  console.log(`Final portfolio value: $${portfolioValue.toFixed(2)} (started at $${STARTING_NOTIONAL})`);
}

main().catch((error) => {
  console.error("[generate-rebalance-ledger] Unhandled error:", error);
  process.exitCode = 1;
});
