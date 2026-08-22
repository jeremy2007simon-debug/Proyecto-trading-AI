/**
 * Block 8.4 §7-12 — consolidated audit: execution timing sensitivity,
 * cost sensitivity (incl. 15/20bps), sample size, full OOS breakdown,
 * rolling (expanding-window) OOS, and all 18 walk-forward windows
 * individually. One script for efficiency; each section writes its own
 * JSON file under results/block8-4/.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block8-4/execution-cost-oos-wf-audit.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runTrendPullbackBacktest, type TrendPullbackConfig } from "@/core/us-index-research/trend-pullback";
import { toAdjustedCandles } from "@/core/us-index-research/daily-series";
import { computeMonthlyReturnMetrics, computeCagrFromMonthlyReturns } from "@/core/backtesting/research/portfolio-metrics";
import { computeBreakEvenCost, type CostSensitivityPoint } from "@/core/backtesting/research/break-even-cost";
import { splitMonthsChronologically } from "@/core/portfolio-research/oos-split";
import { buildMonthlyWalkForwardWindows, DEFAULT_MONTHLY_WALK_FORWARD } from "@/core/portfolio-research/walk-forward";
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
  const original = runTrendPullbackBacktest(candles, R3B_CONFIG, "REALISTIC");
  const originalMonthly = aggregateMonthly(original.map((d) => d.date), original.map((d) => d.netReturn));

  // ============================================================
  // §7 EXECUTION TIMING — same-close (original) vs next-open fill
  // ============================================================
  {
    const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "execution-timing");
    mkdirSync(OUTPUT_DIR, { recursive: true });

    // Adjusted open series (same per-bar ratio convention as toAdjustedCandles).
    const sortedBars = [...bars].sort((a, b) => a.date.localeCompare(b.date));
    const adjOpen = sortedBars.map((b) => (b.close > 0 ? b.open * (b.adjClose / b.close) : b.open));
    const adjClose = sortedBars.map((b) => b.adjClose);
    const flags = original.map((d) => (d.inPosition ? 1 : 0));
    // `original` starts at index 1 of `sortedBars`/`candles` (day 0 has no prior return) — align.
    const flagsFull = [0, ...flags];

    const nextOpenReturns: number[] = [];
    const dates: string[] = [];
    for (let i = 1; i < sortedBars.length; i++) {
      const flag = flagsFull[i];
      const prevFlag = flagsFull[i - 1];
      let r: number;
      if (flag === 1 && prevFlag === 0) r = adjClose[i] / adjOpen[i] - 1; // entry day: bought at today's open, missed overnight gap
      else if (flag === 0 && prevFlag === 1) r = adjOpen[i] / adjClose[i - 1] - 1; // exit day: sold at today's open, captured overnight gap only
      else if (flag === 1 && prevFlag === 1) r = adjClose[i] / adjClose[i - 1] - 1; // mid-hold: unchanged close-to-close
      else r = 0;
      nextOpenReturns.push(r);
      dates.push(sortedBars[i].date);
    }
    const nextOpenMonthly = aggregateMonthly(dates, nextOpenReturns);
    const sameCloseMetrics = computeMonthlyReturnMetrics(originalMonthly.returnsPct);
    const nextOpenMetrics = computeMonthlyReturnMetrics(nextOpenMonthly.returnsPct);

    writeFileSync(
      join(OUTPUT_DIR, "timing-sensitivity.json"),
      JSON.stringify(
        {
          note: "Neither convention is chosen retrospectively as 'the' result — both are reported. R3-B was promoted (Block 8.3) under the SAME-CLOSE convention; RS3M_CANDIDATE_V1 uses NEXT-OPEN. This measures R3-B's sensitivity to that specific difference.",
          sameCloseConvention_originalPromotion: sameCloseMetrics,
          nextOpenConvention_moreConservativeLikeRS3M: nextOpenMetrics,
          cagrDeltaPct: (sameCloseMetrics.cagrPct ?? 0) - (nextOpenMetrics.cagrPct ?? 0),
          sharpeDelta: (sameCloseMetrics.sharpeRatio ?? 0) - (nextOpenMetrics.sharpeRatio ?? 0),
          survivesNextOpen: (nextOpenMetrics.cagrPct ?? -1) > 0,
        },
        null,
        2,
      ),
    );
  }

  // ============================================================
  // §8 COST AUDIT — 0/1/2/3/5/8/12/15/20 bps PER LEG (matching the frozen spec's documented per-leg convention)
  // ============================================================
  {
    const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "costs");
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const bpsLevels = [0, 1, 2, 3, 5, 8, 12, 15, 20];
    const points: CostSensitivityPoint[] = bpsLevels.map((bps) => {
      const days = runTrendPullbackBacktest(candles, R3B_CONFIG, "OPTIMISTIC", bps);
      const monthly = aggregateMonthly(days.map((d) => d.date), days.map((d) => d.netReturn));
      return { bps, expectancyR: computeCagrFromMonthlyReturns(monthly.returnsPct) ?? 0 };
    });
    const breakEven = computeBreakEvenCost(points);
    // Also compute the TRUE-ROUND-TRIP-3bps-TOTAL scenario (half the per-leg charge) per the frozen spec §9 finding — the label Block 8.3 originally used.
    const halfPoints: CostSensitivityPoint[] = bpsLevels.map((bps) => {
      const days = runTrendPullbackBacktest(candles, R3B_CONFIG, "OPTIMISTIC", bps / 2);
      const monthly = aggregateMonthly(days.map((d) => d.date), days.map((d) => d.netReturn));
      return { bps, expectancyR: computeCagrFromMonthlyReturns(monthly.returnsPct) ?? 0 };
    });

    writeFileSync(
      join(OUTPUT_DIR, "cost-sensitivity.json"),
      JSON.stringify(
        {
          note: "bps figures are PER-LEG (matching the original's actual charging convention, documented in docs/R3B_CANDIDATE_SPEC.md §9) — a full round trip costs 2x the stated bps. halfPoints shows the SAME bps figures interpreted as a TRUE total-round-trip cost (bps/2 per leg) for comparison against the '3bps round trip' label Block 8.3 used.",
          costLabel: "ESTIMATED — no real bid/ask feed reachable this environment, never presented as OBSERVED",
          perLegCostSensitivity: points,
          totalRoundTripInterpretation: halfPoints,
          breakEvenCost_perLeg: breakEven,
          survivesUpTo20bpsPerLeg: points.every((p) => p.expectancyR > 0),
        },
        null,
        2,
      ),
    );
  }

  // ============================================================
  // §9 SAMPLE SIZE
  // ============================================================
  {
    const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "oos");
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const inPositionDays = original.filter((d) => d.inPosition).length;
    const totalDays = original.length;
    const years = totalDays / 252;

    // Derive trades from flag transitions for holding-period distribution.
    const holdLengths: number[] = [];
    let holding = 0;
    for (const d of original) {
      if (d.inPosition) holding += 1;
      else if (holding > 0) {
        holdLengths.push(holding);
        holding = 0;
      }
    }
    if (holding > 0) holdLengths.push(holding);
    holdLengths.sort((a, b) => a - b);
    const median = holdLengths[Math.floor(holdLengths.length / 2)];

    const sampleSize = {
      years: Number(years.toFixed(2)),
      totalTradingDays: totalDays,
      trades: holdLengths.length,
      tradesPerYear: Number((holdLengths.length / years).toFixed(3)),
      timeInMarketPct: Number(((inPositionDays / totalDays) * 100).toFixed(2)),
      holdingPeriodDaysDistribution: { min: holdLengths[0], p25: holdLengths[Math.floor(holdLengths.length * 0.25)], median, p75: holdLengths[Math.floor(holdLengths.length * 0.75)], max: holdLengths[holdLengths.length - 1] },
    };

    // ============================================================
    // §10 FULL OOS AUDIT
    // ============================================================
    const split = splitMonthsChronologically(originalMonthly.returnsPct);
    const isMetrics = computeMonthlyReturnMetrics(split.inSample);
    const oosMetrics = computeMonthlyReturnMetrics(split.outOfSample);

    writeFileSync(
      join(OUTPUT_DIR, "sample-size-and-oos.json"),
      JSON.stringify(
        {
          sampleSize,
          oosSplitFrozenIn: "@/core/portfolio-research/oos-split.ts (OOS_HOLDOUT_PCT=30, chronological, reused unchanged since Block 8.2)",
          inSample: isMetrics,
          outOfSample: oosMetrics,
        },
        null,
        2,
      ),
    );
  }

  // ============================================================
  // §11 ROLLING (EXPANDING-WINDOW) OOS — no reoptimization, same frozen R3-B config throughout
  // ============================================================
  {
    const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "oos");
    const months = originalMonthly.months;
    const returns = originalMonthly.returnsPct;
    const testWindowMonths = 24;
    const stepMonths = 12;
    const minTrainMonths = 60;

    const windows: { trainMonths: number; testFrom: string; testTo: string; testCagrPct: number | undefined; testSharpe: number | undefined }[] = [];
    for (let testStart = minTrainMonths; testStart + testWindowMonths <= returns.length; testStart += stepMonths) {
      const testSlice = returns.slice(testStart, testStart + testWindowMonths);
      const metrics = computeMonthlyReturnMetrics(testSlice);
      windows.push({ trainMonths: testStart, testFrom: months[testStart], testTo: months[Math.min(testStart + testWindowMonths - 1, months.length - 1)], testCagrPct: metrics.cagrPct, testSharpe: metrics.sharpeRatio });
    }
    const positiveCount = windows.filter((w) => (w.testCagrPct ?? -1) > 0).length;
    const excessReturns = windows.map((w) => w.testCagrPct ?? 0).sort((a, b) => a - b);
    const median = excessReturns[Math.floor(excessReturns.length / 2)];

    writeFileSync(
      join(OUTPUT_DIR, "rolling-oos.json"),
      JSON.stringify(
        {
          note: "Expanding-train, fixed 24-month test window, stepping 12 months — NO reoptimization, same frozen R3-B config for every window.",
          windowCount: windows.length,
          fractionPositive: windows.length > 0 ? positiveCount / windows.length : 0,
          medianTestCagrPct: median,
          worstWindow: windows.reduce((worst, w) => ((w.testCagrPct ?? 0) < (worst.testCagrPct ?? 0) ? w : worst), windows[0]),
          degradationTrend: windows.length >= 2 ? { firstHalfMedianCagr: median, note: "see windows[] for the full sequence — inspect visually for a trend, not summarized into a single number here to avoid overstating a pattern from a small window count." } : undefined,
          windows,
        },
        null,
        2,
      ),
    );
  }

  // ============================================================
  // §12 WALK-FORWARD — all windows individually, reproduced independently of Block 8.3's summary
  // ============================================================
  {
    const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "walk-forward");
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const split = splitMonthsChronologically(originalMonthly.returnsPct);
    const monthsForWindows = originalMonthly.months.slice(0, split.inSample.length);
    const windowsData = buildMonthlyWalkForwardWindows(
      split.inSample.map((r, i) => ({ ret: r, month: monthsForWindows[i] })),
      DEFAULT_MONTHLY_WALK_FORWARD,
    );

    // Also need SPY buy-and-hold for the SAME months, for an excess-return comparison per window.
    const spyMonthly = aggregateMonthly(bars.map((b) => b.date), bars.slice(1).map((b, i) => bars[i].adjClose > 0 ? b.adjClose / bars[i].adjClose - 1 : 0));
    const spyByMonth = new Map(spyMonthly.months.map((m, i) => [m, spyMonthly.returnsPct[i]]));

    const detailedWindows = windowsData.map((w, idx) => {
      const forwardReturns = w.forward.map((x) => x.ret);
      const metrics = computeMonthlyReturnMetrics(forwardReturns);
      const period = { from: w.forward[0]?.month, to: w.forward[w.forward.length - 1]?.month };
      const benchmarkReturns = w.forward.map((x) => spyByMonth.get(x.month) ?? 0);
      const benchmarkCagr = computeCagrFromMonthlyReturns(benchmarkReturns);
      return {
        window: idx,
        period,
        returnPct: metrics.totalReturnPct,
        cagrPct: metrics.cagrPct,
        maxDdPct: metrics.maxDrawdownPct,
        benchmarkSpyCagrPct: benchmarkCagr,
        excessCagrPct: metrics.cagrPct !== undefined && benchmarkCagr !== undefined ? metrics.cagrPct - benchmarkCagr : undefined,
        positive: (metrics.cagrPct ?? -1) > 0,
        monthsInWindow: w.forward.length,
      };
    });

    const positiveCount = detailedWindows.filter((w) => w.positive).length;
    writeFileSync(
      join(OUTPUT_DIR, "windows-detailed.json"),
      JSON.stringify(
        {
          config: DEFAULT_MONTHLY_WALK_FORWARD,
          windowCount: detailedWindows.length,
          positiveCount,
          positivePct: detailedWindows.length > 0 ? (positiveCount / detailedWindows.length) * 100 : 0,
          returnDistribution: {
            best: Math.max(...detailedWindows.map((w) => w.cagrPct ?? -Infinity)),
            worst: Math.min(...detailedWindows.map((w) => w.cagrPct ?? Infinity)),
            median: [...detailedWindows.map((w) => w.cagrPct ?? 0)].sort((a, b) => a - b)[Math.floor(detailedWindows.length / 2)],
          },
          windows: detailedWindows,
        },
        null,
        2,
      ),
    );
  }

  console.log("[Block 8.4] execution-cost-oos-wf-audit complete.");
}

main();
