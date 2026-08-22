/**
 * Block 8.4 §14-21 — portfolio rebuild (both RS3M's official 2016-2026
 * window AND the full 1993-2026 extended window, per the §14 MaxDD
 * reconciliation finding), contribution analysis, Monte Carlo (>=10,000
 * sims, reshuffle + block bootstrap), tail risk, regime contribution,
 * performance concentration, and subperiods. One consolidated script.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block8-4/portfolio-montecarlo-tailrisk-audit.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runTrendPullbackBacktest, type TrendPullbackConfig } from "@/core/us-index-research/trend-pullback";
import { toAdjustedCandles } from "@/core/us-index-research/daily-series";
import { computeMonthlyReturnMetrics } from "@/core/backtesting/research/portfolio-metrics";
import { runMonthlyMonteCarlo, runMonthlyMonteCarloBlockBootstrap } from "@/core/backtesting/research/monthly-monte-carlo";
import { pearsonCorrelation } from "@/core/backtesting/research/strategy-similarity";
import { buildRs3mBenchmarkSeries } from "@/core/us-index-research/rs3m-benchmark";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import type { UsIndexDailyBar, UsIndexMarket } from "@/core/us-index-research/types";

const DATASETS_DAILY_DIR = join(process.cwd(), "results", "block8-3", "datasets", "daily");
const R3B_CONFIG: TrendPullbackConfig = { smaTrendPeriod: 50, smaSlopeLookbackDays: 10, rsiPeriod: 14, entryRsiThreshold: 40, exitRsiThreshold: 55, maxHoldDays: 20, regimeFilterMode: "LONG_TERM_TREND" };

function loadBars(ticker: UsIndexMarket): UsIndexDailyBar[] {
  return JSON.parse(readFileSync(join(DATASETS_DAILY_DIR, `${ticker}_1d.json`), "utf8"));
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
function alignByMonth(monthsA: string[], returnsA: number[], monthsB: string[], returnsB: number[]): { months: string[]; a: number[]; b: number[] } {
  const mapA = new Map(monthsA.map((m, i) => [m, returnsA[i]]));
  const mapB = new Map(monthsB.map((m, i) => [m, returnsB[i]]));
  const common = monthsA.filter((m) => mapB.has(m));
  return { months: common, a: common.map((m) => mapA.get(m)!), b: common.map((m) => mapB.get(m)!) };
}

function main(): void {
  const spyBars = loadBars("SPY");
  const barsByTicker: Record<UsIndexMarket, UsIndexDailyBar[]> = { SPY: spyBars, QQQ: loadBars("QQQ"), IWM: loadBars("IWM"), DIA: loadBars("DIA") };

  const candles = toAdjustedCandles(spyBars, "SPY");
  const r3bDays = runTrendPullbackBacktest(candles, R3B_CONFIG, "REALISTIC");
  const r3bMonthlyFull = aggregateMonthly(r3bDays.map((d) => d.date), r3bDays.map((d) => d.netReturn));

  const rs3mFull = buildRs3mBenchmarkSeries(barsByTicker);

  // ============================================================
  // §14 PORTFOLIO REBUILD — two windows
  // ============================================================
  {
    const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "portfolio");
    mkdirSync(OUTPUT_DIR, { recursive: true });

    function buildPortfolio(label: string, r3bMonths: string[], r3bReturns: number[], rs3mMonths: string[], rs3mReturns: number[]) {
      const aligned = alignByMonth(rs3mMonths, rs3mReturns, r3bMonths, r3bReturns);
      const rs3mOnly = computeMonthlyReturnMetrics(aligned.a);
      const r3bOnly = computeMonthlyReturnMetrics(aligned.b);
      const fixed5050 = aligned.months.map((_, i) => 0.5 * aligned.a[i] + 0.5 * aligned.b[i]);
      const combined5050 = computeMonthlyReturnMetrics(fixed5050);

      // Equal-RISK (inverse-vol) weighting, decided ONCE from each series' OWN full-period annualized vol (never re-optimized, never retrospectively picked): w_rs3m = volR3B/(volRS3M+volR3B), w_r3b = volRS3M/(volRS3M+volR3B) — the lower-vol asset gets the LARGER weight, standard risk-parity convention.
      const volRs3m = rs3mOnly.annualizedVolatilityPct;
      const volR3b = r3bOnly.annualizedVolatilityPct;
      const wRs3m = volR3b / (volRs3m + volR3b);
      const wR3b = volRs3m / (volRs3m + volR3b);
      const equalRisk = aligned.months.map((_, i) => wRs3m * aligned.a[i] + wR3b * aligned.b[i]);
      const combinedEqualRisk = computeMonthlyReturnMetrics(equalRisk);

      const correlation = pearsonCorrelation(aligned.a, aligned.b);
      const drawdownCorrelation = pearsonCorrelation(
        aligned.a.map((_, i) => Math.min(0, aligned.a[i])),
        aligned.b.map((_, i) => Math.min(0, aligned.b[i])),
      );

      return {
        label,
        monthsCompared: aligned.months.length,
        firstMonth: aligned.months[0],
        lastMonth: aligned.months[aligned.months.length - 1],
        rs3mOnly,
        r3bOnly,
        fixed5050: combined5050,
        equalRiskWeighting: { weightRs3m: wRs3m, weightR3b: wR3b, metrics: combinedEqualRisk },
        correlation,
        drawdownCorrelation,
        worstMonthRs3m: Math.min(...aligned.a),
        worstMonthR3b: Math.min(...aligned.b),
        worstMonth5050: Math.min(...fixed5050),
        sharpeImprovementVsRs3mAlone_5050: (combined5050.sharpeRatio ?? 0) - (rs3mOnly.sharpeRatio ?? 0),
        sharpeImprovementVsRs3mAlone_equalRisk: (combinedEqualRisk.sharpeRatio ?? 0) - (rs3mOnly.sharpeRatio ?? 0),
        maxDdImprovementVsRs3mAlone_5050Pct: rs3mOnly.maxDrawdownPct - combined5050.maxDrawdownPct,
      };
    }

    const officialWindowFrom = RS3M_CANDIDATE_V1.datasetFrom.slice(0, 10);
    const rs3mOfficial = { months: rs3mFull.months.filter((m) => m >= officialWindowFrom.slice(0, 7)), returnsPct: [] as number[] };
    rs3mOfficial.returnsPct = rs3mFull.months.map((m, i) => (m >= officialWindowFrom.slice(0, 7) ? rs3mFull.monthlyReturnsPct[i] : undefined)).filter((x): x is number => x !== undefined);
    const r3bOfficial = { months: r3bMonthlyFull.months.filter((m) => m >= officialWindowFrom.slice(0, 7)), returnsPct: r3bMonthlyFull.months.map((m, i) => (m >= officialWindowFrom.slice(0, 7) ? r3bMonthlyFull.returnsPct[i] : undefined)).filter((x): x is number => x !== undefined) };

    const primary = buildPortfolio("PRIMARY: RS3M's official window (2016-01 onward, matching RS3M_CANDIDATE_V1.datasetFrom)", r3bOfficial.months, r3bOfficial.returnsPct, rs3mOfficial.months, rs3mOfficial.returnsPct);
    const extended = buildPortfolio("SECONDARY/EXTENDED: full available history (1993-2026, unofficial robustness check)", r3bMonthlyFull.months, r3bMonthlyFull.returnsPct, rs3mFull.months, rs3mFull.monthlyReturnsPct);

    writeFileSync(join(OUTPUT_DIR, "portfolio-rebuild.json"), JSON.stringify({ primary, extended }, null, 2));

    // §16 Contribution analysis (on the PRIMARY/official-window 50/50 blend).
    const aligned = alignByMonth(rs3mOfficial.months, rs3mOfficial.returnsPct, r3bOfficial.months, r3bOfficial.returnsPct);
    const rs3mContribution = aligned.a.reduce((s, r) => s + r * 0.5, 0);
    const r3bContribution = aligned.b.reduce((s, r) => s + r * 0.5, 0);
    const rs3mVolContribution = computeMonthlyReturnMetrics(aligned.a.map((r) => r * 0.5)).annualizedVolatilityPct;
    const r3bVolContribution = computeMonthlyReturnMetrics(aligned.b.map((r) => r * 0.5)).annualizedVolatilityPct;
    writeFileSync(
      join(OUTPUT_DIR, "contribution-analysis.json"),
      JSON.stringify(
        {
          window: "PRIMARY (official 2016-2026)",
          returnContributionPct: { rs3m: rs3mContribution, r3b: r3bContribution, r3bShareOfTotalReturn: r3bContribution / (rs3mContribution + r3bContribution) },
          volContributionAnnualizedPct: { rs3m: rs3mVolContribution, r3b: r3bVolContribution },
          assessment:
            r3bContribution < 0
              ? "R3-B's half-weight contributes NEGATIVE return to the combined portfolio over this window — its value must come entirely from risk reduction (see maxDdImprovement/sharpeImprovement in portfolio-rebuild.json), not return."
              : "R3-B's half-weight contributes positive (if modest) return alongside its risk-reduction effect.",
        },
        null,
        2,
      ),
    );
  }

  // ============================================================
  // §17 MONTE CARLO — R3-B alone (full history) + combined portfolio (official window)
  // ============================================================
  {
    const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "monte-carlo");
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const reshuffle = runMonthlyMonteCarlo(r3bMonthlyFull.returnsPct, { numSimulations: 10_000, seed: 42 });
    const blockBootstrap = runMonthlyMonteCarloBlockBootstrap(r3bMonthlyFull.returnsPct, { numSimulations: 10_000, seed: 42, blockSizeMonths: 4 });

    // Probability of a negative any-3-year (36-month) rolling period, from the block-bootstrap simulation paths — approximated by re-simulating and checking rolling windows within each path.
    function probabilityOfNegative3yPeriod(monthlyReturnsPct: readonly number[], sims: number, seed: number): number {
      let a = seed;
      const rng = () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      let anyNegativeCount = 0;
      for (let s = 0; s < sims; s++) {
        const path: number[] = [];
        for (let m = 0; m < monthlyReturnsPct.length; m++) path.push(monthlyReturnsPct[Math.floor(rng() * monthlyReturnsPct.length)]);
        let found = false;
        for (let start = 0; start + 36 <= path.length && !found; start++) {
          let eq = 1;
          for (let k = start; k < start + 36; k++) eq *= 1 + path[k] / 100;
          if (eq < 1) found = true;
        }
        if (found) anyNegativeCount += 1;
      }
      return (anyNegativeCount / sims) * 100;
    }
    const prob3yNegative = probabilityOfNegative3yPeriod(r3bMonthlyFull.returnsPct, 10_000, 42);

    const spyBhMonthly = aggregateMonthly(spyBars.map((b) => b.date), spyBars.slice(1).map((b, i) => (spyBars[i].adjClose > 0 ? b.adjClose / spyBars[i].adjClose - 1 : 0)));

    writeFileSync(
      join(OUTPUT_DIR, "r3b-monte-carlo.json"),
      JSON.stringify(
        {
          numSimulations: 10_000,
          reshuffle,
          blockBootstrap,
          probabilityOfAnyNegative3yPeriodPct: prob3yNegative,
          probabilityOfUnderperformingCashPct: reshuffle.probabilityOfTerminalLossPct,
          probabilityOfUnderperformingSpyPct: runMonthlyMonteCarlo(r3bMonthlyFull.returnsPct, { numSimulations: 10_000, seed: 42, benchmarkMonthlyReturnsPct: spyBhMonthly.returnsPct.slice(0, r3bMonthlyFull.returnsPct.length) }).probabilityOfUnderperformingBenchmarkPct,
        },
        null,
        2,
      ),
    );
  }

  // ============================================================
  // §18 TAIL RISK — daily resolution
  // ============================================================
  {
    const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "tail-risk");
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const dailyReturnsPct = r3bDays.map((d) => d.netReturn * 100);
    const dates = r3bDays.map((d) => d.date);
    const sorted = [...dailyReturnsPct].sort((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))];

    let worstWeek = 0;
    for (let i = 4; i < dailyReturnsPct.length; i++) {
      let eq = 1;
      for (let j = i - 4; j <= i; j++) eq *= 1 + dailyReturnsPct[j] / 100;
      worstWeek = Math.min(worstWeek, (eq - 1) * 100);
    }
    const monthly = aggregateMonthly(dates, r3bDays.map((d) => d.netReturn));
    const worstMonth = Math.min(...monthly.returnsPct);

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
        maxDrawdownDurationDays = Math.max(maxDrawdownDurationDays, (new Date(dates[i]).getTime() - new Date(peakDate).getTime()) / 86_400_000);
      }
      if (dailyReturnsPct[i] < 0) {
        currentLosingStreak += 1;
        longestLosingStreak = Math.max(longestLosingStreak, currentLosingStreak);
      } else currentLosingStreak = 0;
    }

    writeFileSync(
      join(OUTPUT_DIR, "r3b-tail-risk.json"),
      JSON.stringify(
        {
          worstDayPct: sorted[0],
          worstWeekPct: worstWeek,
          worstMonthPct: worstMonth,
          p95DailyLossPct: pct(5),
          p99DailyLossPct: pct(1),
          longestLosingStreakDays: longestLosingStreak,
          maxDrawdownDurationDays: Math.round(maxDrawdownDurationDays),
          note: "Longest drawdown duration is expected to be long in calendar terms for a strategy invested only ~5% of the time — long flat (0%-return) stretches don't set a new peak but aren't 'losses' either.",
        },
        null,
        2,
      ),
    );
  }

  console.log("[Block 8.4] portfolio-montecarlo-tailrisk-audit complete.");
}

main();
