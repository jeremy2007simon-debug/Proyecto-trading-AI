/**
 * Block 8.4 §19-21 — regime contribution, performance concentration
 * (remove best trades/months), and subperiod stability.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block8-4/regime-concentration-subperiods-audit.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runTrendPullbackBacktest, type TrendPullbackConfig } from "@/core/us-index-research/trend-pullback";
import { toAdjustedCandles } from "@/core/us-index-research/daily-series";
import { buildMonthlyRegimeLabels, computeRegimeBucketBreakdown } from "@/core/us-index-research/regime-breakdown";
import { computeMonthlyReturnMetrics } from "@/core/backtesting/research/portfolio-metrics";
import type { UsIndexDailyBar } from "@/core/us-index-research/types";

const DATASETS_DAILY_DIR = join(process.cwd(), "results", "block8-3", "datasets", "daily");
const R3B_CONFIG: TrendPullbackConfig = { smaTrendPeriod: 50, smaSlopeLookbackDays: 10, rsiPeriod: 14, entryRsiThreshold: 40, exitRsiThreshold: 55, maxHoldDays: 20, regimeFilterMode: "LONG_TERM_TREND" };

function loadSpyBars(): UsIndexDailyBar[] {
  return JSON.parse(readFileSync(join(DATASETS_DAILY_DIR, "SPY_1d.json"), "utf8"));
}
function monthKey(date: string): string {
  return date.slice(0, 7);
}
function aggregateMonthly(dates: string[], netReturns: number[]): { months: string[]; returnsPct: number[] } {
  const months: string[] = [];
  const returnsPct: number[] = [];
  let currentMonth: string | undefined;
  let equity = 1;
  for (let i = 0; i < dates.length; i++) {
    const mk = monthKey(dates[i]);
    if (mk !== currentMonth) {
      if (currentMonth !== undefined) {
        months.push(currentMonth);
        returnsPct.push((equity - 1) * 100);
      }
      currentMonth = mk;
      equity = 1;
    }
    equity *= 1 + netReturns[i];
  }
  if (currentMonth !== undefined) {
    months.push(currentMonth);
    returnsPct.push((equity - 1) * 100);
  }
  return { months, returnsPct };
}

function main(): void {
  const bars = loadSpyBars();
  const candles = toAdjustedCandles(bars, "SPY");
  const days = runTrendPullbackBacktest(candles, R3B_CONFIG, "REALISTIC");
  const monthly = aggregateMonthly(days.map((d) => d.date), days.map((d) => d.netReturn));
  const fullMetrics = computeMonthlyReturnMetrics(monthly.returnsPct);

  // ============================================================
  // §19 REGIME CONTRIBUTION
  // ============================================================
  {
    const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "regime-sensitivity");
    const labels = buildMonthlyRegimeLabels(bars, "SPY");
    const breakdown = computeRegimeBucketBreakdown(monthly.months, monthly.returnsPct, labels);
    writeFileSync(
      join(OUTPUT_DIR, "regime-contribution.json"),
      JSON.stringify(
        {
          note: "BULL/BEAR (vs SMA200) and LOW_VOL/HIGH_VOL (realized-vol percentile) computed causally from SPY price data alone — rate-hiking/cutting and risk-on/risk-off NOT computed (no external rate/sentiment data source fetched, same disclosed limitation as Block 8.3).",
          breakdown,
        },
        null,
        2,
      ),
    );
  }

  // ============================================================
  // §20 PERFORMANCE CONCENTRATION
  // ============================================================
  {
    const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "concentration");
    mkdirSync(OUTPUT_DIR, { recursive: true });

    // Derive per-trade returns from daily results (flag transitions), matching the trade list used elsewhere in this block.
    interface TradeReturn {
      entryDate: string;
      exitDate: string;
      grossMultiplier: number;
    }
    const trades: TradeReturn[] = [];
    let inTrade = false;
    let entryDate = "";
    let multiplier = 1;
    for (const d of days) {
      if (d.inPosition && !inTrade) {
        inTrade = true;
        entryDate = d.date;
        multiplier = 1;
      }
      if (inTrade) multiplier *= 1 + d.netReturn;
      if (!d.inPosition && inTrade) {
        trades.push({ entryDate, exitDate: d.date, grossMultiplier: multiplier });
        inTrade = false;
      }
    }

    function metricsExcluding(excludedTradeIndices: Set<number>): ReturnType<typeof computeMonthlyReturnMetrics> {
      const excludedDateRanges = [...excludedTradeIndices].map((i) => trades[i]);
      const filteredDays = days.map((d) => {
        const inExcludedTrade = excludedDateRanges.some((t) => d.date >= t.entryDate && d.date <= t.exitDate);
        return inExcludedTrade ? { ...d, netReturn: 0 } : d;
      });
      const m = aggregateMonthly(filteredDays.map((d) => d.date), filteredDays.map((d) => d.netReturn));
      return computeMonthlyReturnMetrics(m.returnsPct);
    }

    const tradesByReturn = trades.map((t, i) => ({ i, ret: t.grossMultiplier - 1 })).sort((a, b) => b.ret - a.ret);
    const removeBestNTrades = [1, 3, 5].map((n) => ({
      n,
      metrics: metricsExcluding(new Set(tradesByReturn.slice(0, n).map((t) => t.i))),
    }));

    const monthsByReturn = monthly.months.map((m, i) => ({ m, ret: monthly.returnsPct[i] })).sort((a, b) => b.ret - a.ret);
    function metricsExcludingMonths(excludedMonths: Set<string>): ReturnType<typeof computeMonthlyReturnMetrics> {
      const filtered = monthly.months.map((m, i) => (excludedMonths.has(m) ? 0 : monthly.returnsPct[i]));
      return computeMonthlyReturnMetrics(filtered);
    }
    const removeBestNMonths = [1, 3, 5].map((n) => ({
      n,
      metrics: metricsExcludingMonths(new Set(monthsByReturn.slice(0, n).map((x) => x.m))),
    }));

    writeFileSync(
      join(OUTPUT_DIR, "concentration-analysis.json"),
      JSON.stringify(
        {
          fullPeriod: fullMetrics,
          totalTrades: trades.length,
          bestTrades: tradesByReturn.slice(0, 5).map((t) => ({ ...trades[t.i], returnPct: t.ret * 100 })),
          removeBestTrades: removeBestNTrades,
          bestMonths: monthsByReturn.slice(0, 5),
          removeBestMonths: removeBestNMonths,
          assessment:
            (removeBestNTrades[2].metrics.cagrPct ?? -1) > 0 && (removeBestNMonths[2].metrics.cagrPct ?? -1) > 0
              ? "Edge survives removal of the best 5 trades AND best 5 months (CAGR stays positive in both cases) — not entirely dependent on a small number of outlier events, though see the exact magnitude of degradation above."
              : "CAUTION: removing the best 5 trades or best 5 months turns CAGR negative — the edge is concentrated in a small number of events.",
        },
        null,
        2,
      ),
    );
  }

  // ============================================================
  // §21 SUBPERIODS
  // ============================================================
  {
    const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "subperiods");
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const decades = [
      { label: "1993-1999", from: "1993-01", to: "1999-12" },
      { label: "2000-2009", from: "2000-01", to: "2009-12" },
      { label: "2010-2019", from: "2010-01", to: "2019-12" },
      { label: "2020-2026", from: "2020-01", to: "2026-12" },
    ];
    const decadeResults = decades.map((d) => {
      const slice = monthly.months.map((m, i) => (m >= d.from && m <= d.to ? monthly.returnsPct[i] : undefined)).filter((x): x is number => x !== undefined);
      return { ...d, monthsCount: slice.length, metrics: computeMonthlyReturnMetrics(slice) };
    });

    const half = Math.floor(monthly.returnsPct.length / 2);
    const halves = {
      firstHalf: { period: `${monthly.months[0]} to ${monthly.months[half - 1]}`, metrics: computeMonthlyReturnMetrics(monthly.returnsPct.slice(0, half)) },
      secondHalf: { period: `${monthly.months[half]} to ${monthly.months[monthly.months.length - 1]}`, metrics: computeMonthlyReturnMetrics(monthly.returnsPct.slice(half)) },
    };

    writeFileSync(join(OUTPUT_DIR, "subperiods.json"), JSON.stringify({ decades: decadeResults, halves }, null, 2));
  }

  console.log("[Block 8.4] regime-concentration-subperiods-audit complete.");
}

main();
