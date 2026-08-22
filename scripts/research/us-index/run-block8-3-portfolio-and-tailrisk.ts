/**
 * Block 8.3 — §19 (tail risk) and §22 (portfolio simulation), run ONLY
 * for the round's single surviving candidate (R3-B, per
 * `run-block8-3-review.ts`). Per §23 of the brief, a portfolio
 * simulation is never built for a REJECTED/RESEARCH result — this
 * script is deliberately hardcoded to R3-B, not a generic "run this for
 * any config" tool, so it can never accidentally be pointed at a
 * non-candidate.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/us-index/run-block8-3-portfolio-and-tailrisk.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runTrendPullbackBacktest, type TrendPullbackConfig } from "@/core/us-index-research/trend-pullback";
import { toAdjustedCandles } from "@/core/us-index-research/daily-series";
import { buildRs3mBenchmarkSeries } from "@/core/us-index-research/rs3m-benchmark";
import { simulateRs3mPlusCandidatePortfolio } from "@/core/us-index-research/portfolio-vs-rs3m";
import type { UsIndexDailyBar, UsIndexMarket } from "@/core/us-index-research/types";

const DATASETS_DAILY_DIR = join(process.cwd(), "results", "block8-3", "datasets", "daily");
const TAIL_RISK_DIR = join(process.cwd(), "results", "block8-3", "tail-risk");
const PORTFOLIO_DIR = join(process.cwd(), "results", "block8-3", "portfolio");

function loadDailyBars(ticker: UsIndexMarket): UsIndexDailyBar[] {
  return JSON.parse(readFileSync(join(DATASETS_DAILY_DIR, `${ticker}_1d.json`), "utf8"));
}

const R3B_CONFIG: TrendPullbackConfig = { smaTrendPeriod: 50, smaSlopeLookbackDays: 10, rsiPeriod: 14, entryRsiThreshold: 40, exitRsiThreshold: 55, maxHoldDays: 20, regimeFilterMode: "LONG_TERM_TREND" };

function computeTailRisk(dailyReturnsPct: readonly number[], dates: readonly string[]) {
  const sorted = [...dailyReturnsPct].sort((a, b) => a - b);
  const percentileOf = (p: number) => {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
    return sorted[idx];
  };

  // Worst rolling TRADING week (5 consecutive trading-day returns compounded) — a standard, simple convention; more meaningful for a trading strategy than a calendar-week bucket that can split a bad run across two buckets.
  let worstWeek = 0;
  for (let i = 4; i < dailyReturnsPct.length; i++) {
    let weekEquity = 1;
    for (let j = i - 4; j <= i; j++) weekEquity *= 1 + dailyReturnsPct[j] / 100;
    worstWeek = Math.min(worstWeek, (weekEquity - 1) * 100);
  }

  // Drawdown duration (days) + longest losing streak, from the daily curve.
  let equity = 1;
  let peak = 1;
  let peakDate = dates[0];
  let maxDrawdownDurationDays = 0;
  let currentLosingStreak = 0;
  let longestLosingStreak = 0;
  for (let i = 0; i < dailyReturnsPct.length; i++) {
    equity *= 1 + dailyReturnsPct[i] / 100;
    if (equity >= peak) {
      peak = equity;
      peakDate = dates[i];
    } else {
      const days = (new Date(dates[i]).getTime() - new Date(peakDate).getTime()) / 86_400_000;
      maxDrawdownDurationDays = Math.max(maxDrawdownDurationDays, days);
    }
    if (dailyReturnsPct[i] < 0) {
      currentLosingStreak += 1;
      longestLosingStreak = Math.max(longestLosingStreak, currentLosingStreak);
    } else {
      currentLosingStreak = 0;
    }
  }

  return {
    worstDayPct: sorted[0] ?? 0,
    worstWeekPct: worstWeek,
    p95DailyLossPct: percentileOf(5),
    p99DailyLossPct: percentileOf(1),
    longestLosingStreakDays: longestLosingStreak,
    maxDrawdownDurationDays: Math.round(maxDrawdownDurationDays),
  };
}

function main(): void {
  mkdirSync(TAIL_RISK_DIR, { recursive: true });
  mkdirSync(PORTFOLIO_DIR, { recursive: true });

  const spyBars = loadDailyBars("SPY");
  const candles = toAdjustedCandles(spyBars, "SPY");
  const days = runTrendPullbackBacktest(candles, R3B_CONFIG, "REALISTIC");
  const dailyReturnsPct = days.map((d) => d.netReturn * 100);
  const dates = days.map((d) => d.date);

  const tailRisk = computeTailRisk(dailyReturnsPct, dates);
  writeFileSync(join(TAIL_RISK_DIR, "R3-B.json"), JSON.stringify({ experimentId: "R3-B", ...tailRisk, daysAnalyzed: days.length }, null, 2));
  console.log("[Block 8.3] R3-B tail risk:", tailRisk);

  const barsByTicker: Record<UsIndexMarket, UsIndexDailyBar[]> = { SPY: spyBars, QQQ: loadDailyBars("QQQ"), IWM: loadDailyBars("IWM"), DIA: loadDailyBars("DIA") };
  const rs3m = buildRs3mBenchmarkSeries(barsByTicker);

  // Align R3-B's daily-derived monthly series to RS3M's own months.
  const monthlyByMonth = new Map<string, number>();
  let currentMonth: string | undefined;
  let monthEquity = 1;
  for (const d of days) {
    const mk = d.date.slice(0, 7);
    if (mk !== currentMonth) {
      if (currentMonth !== undefined) monthlyByMonth.set(currentMonth, (monthEquity - 1) * 100);
      currentMonth = mk;
      monthEquity = 1;
    }
    monthEquity *= 1 + d.netReturn;
  }
  if (currentMonth !== undefined) monthlyByMonth.set(currentMonth, (monthEquity - 1) * 100);

  const rs3mByMonth = new Map(rs3m.months.map((m, i) => [m, rs3m.monthlyReturnsPct[i]]));
  const commonMonths = rs3m.months.filter((m) => monthlyByMonth.has(m));
  const alignedR3b = commonMonths.map((m) => monthlyByMonth.get(m)!);
  const alignedRs3m = commonMonths.map((m) => rs3mByMonth.get(m)!);

  const portfolio = simulateRs3mPlusCandidatePortfolio(alignedRs3m, alignedR3b);
  writeFileSync(join(PORTFOLIO_DIR, "RS3M_plus_R3-B.json"), JSON.stringify(portfolio, null, 2));
  console.log("[Block 8.3] RS3M + R3-B portfolio:", JSON.stringify(portfolio, null, 2));
}

main();
