/**
 * Block 8.4 §4-5 — Regime filter sensitivity audit. FROZEN BEFORE
 * EXECUTION, per this block's explicit "No optimices... No elegir
 * posteriormente la mejor variante" instruction:
 *
 * For each of R3-B's 5 numeric parameters, test EXACTLY the symmetric
 * perturbation set {-10%, -5%, BASE, +5%, +10%} (rounded to the nearest
 * integer bar-count, since these are all bar/day counts), holding every
 * OTHER parameter at its frozen BASE value — never combinatorial, never
 * re-optimized. Classification rule (frozen, applied mechanically,
 * never adjusted after seeing results):
 *
 *   PLATEAU:      every neighbor's Sharpe stays within 25% relative of
 *                 BASE, no sign flip.
 *   WEAK_PLATEAU: max relative degradation 25-50%, no sign flip (OR a
 *                 sign flip only at the OUTER +-10% point, not +-5%).
 *   CLIFF:        an INNER (+-5%, the closest) neighbor already shows
 *                 >50% relative degradation or a sign flip, while BASE
 *                 itself is healthy.
 *   UNSTABLE:     neighbors sign-flip in BOTH directions, or swing
 *                 non-monotonically by >50% on both sides with no
 *                 coherent pattern.
 *
 * ALSO reuses Block 8.3's own already-computed R3-A (regimeFilterMode
 * NONE) / R3-C (VOL_REGIME) / R3-D (BOTH) results as the DISCRETE
 * regime-definition comparison §5 asks for — genuinely new numbers are
 * not fabricated for something already measured; the existing funnel
 * results are the correct source.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block8-4/regime-sensitivity-audit.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runTrendPullbackBacktest, type TrendPullbackConfig } from "@/core/us-index-research/trend-pullback";
import { toAdjustedCandles } from "@/core/us-index-research/daily-series";
import { computeMonthlyReturnMetrics } from "@/core/backtesting/research/portfolio-metrics";
import { runR3bIndependentReproduction, R3B_ORIGINAL_CONFIG, type R3bBarInput } from "@/core/r3b-verification/independent-reproduction";
import type { UsIndexDailyBar } from "@/core/us-index-research/types";

const DATASETS_DAILY_DIR = join(process.cwd(), "results", "block8-3", "datasets", "daily");
const OUTPUT_DIR = join(process.cwd(), "results", "block8-4", "regime-sensitivity");

const BASE_CONFIG: TrendPullbackConfig = { smaTrendPeriod: 50, smaSlopeLookbackDays: 10, rsiPeriod: 14, entryRsiThreshold: 40, exitRsiThreshold: 55, maxHoldDays: 20, regimeFilterMode: "LONG_TERM_TREND" };

function monthKey(date: string): string {
  return date.slice(0, 7);
}
function aggregateMonthly(dates: string[], netReturns: number[]): number[] {
  const returnsPct: number[] = [];
  let currentMonth: string | undefined;
  let equity = 1;
  for (let i = 0; i < dates.length; i++) {
    const mk = monthKey(dates[i]);
    if (mk !== currentMonth) {
      if (currentMonth !== undefined) returnsPct.push((equity - 1) * 100);
      currentMonth = mk;
      equity = 1;
    }
    equity *= 1 + netReturns[i];
  }
  if (currentMonth !== undefined) returnsPct.push((equity - 1) * 100);
  return returnsPct;
}

function sharpeFor(candles: ReturnType<typeof toAdjustedCandles>, config: TrendPullbackConfig): number | undefined {
  const days = runTrendPullbackBacktest(candles, config, "REALISTIC");
  const monthly = aggregateMonthly(days.map((d) => d.date), days.map((d) => d.netReturn));
  return computeMonthlyReturnMetrics(monthly).sharpeRatio;
}

interface ParamPerturbation {
  name: keyof TrendPullbackConfig;
  base: number;
}
const PARAMS: ParamPerturbation[] = [
  { name: "smaTrendPeriod", base: 50 },
  { name: "rsiPeriod", base: 14 },
  { name: "entryRsiThreshold", base: 40 },
  { name: "exitRsiThreshold", base: 55 },
  { name: "maxHoldDays", base: 20 },
];
// SMA(200) is defined inside regime.ts as a fixed constant (not a TrendPullbackConfig field) — audited separately below via a temporary local override, since it cannot be perturbed through the public config surface without touching the frozen regime module itself.
const REGIME_SMA_PERIOD_BASE = 200;

type Classification = "PLATEAU" | "WEAK_PLATEAU" | "CLIFF" | "UNSTABLE";

function classify(baseSharpe: number, neighbors: { pct: number; sharpe: number | undefined }[]): Classification {
  const rel = (s: number | undefined) => (s === undefined ? -1 : baseSharpe !== 0 ? (s - baseSharpe) / Math.abs(baseSharpe) : s - baseSharpe);
  const signFlip = (s: number | undefined) => s !== undefined && Math.sign(s) !== Math.sign(baseSharpe) && baseSharpe !== 0;

  const inner = neighbors.filter((n) => Math.abs(n.pct) === 5);
  const outer = neighbors.filter((n) => Math.abs(n.pct) === 10);
  const innerFlips = inner.filter((n) => signFlip(n.sharpe));
  const outerFlips = outer.filter((n) => signFlip(n.sharpe));
  const maxDegradation = Math.max(...neighbors.map((n) => -rel(n.sharpe)));

  const negativeFlipsCount = neighbors.filter((n) => signFlip(n.sharpe)).length;
  if (negativeFlipsCount >= 2 || (maxDegradation > 0.5 && neighbors.some((n) => rel(n.sharpe) > 0.3))) return "UNSTABLE";
  if (innerFlips.length > 0 || (inner.some((n) => -rel(n.sharpe) > 0.5))) return "CLIFF";
  if (maxDegradation <= 0.25) return "PLATEAU";
  if (maxDegradation <= 0.5 || outerFlips.length > 0) return "WEAK_PLATEAU";
  return "CLIFF";
}

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const bars: UsIndexDailyBar[] = JSON.parse(readFileSync(join(DATASETS_DAILY_DIR, "SPY_1d.json"), "utf8"));
  const candles = toAdjustedCandles(bars, "SPY");

  const baseSharpe = sharpeFor(candles, BASE_CONFIG)!;
  const report: Record<string, unknown> = { baseSharpe };

  for (const param of PARAMS) {
    const perturbationPcts = [-10, -5, 5, 10];
    const neighbors = perturbationPcts.map((pct) => {
      const delta = Math.round(param.base * (pct / 100));
      const value = param.base + (delta === 0 ? Math.sign(pct) : delta); // ensure at least a 1-unit change for small bases (e.g. rsiPeriod=14 at 5% would round to 1)
      const config: TrendPullbackConfig = { ...BASE_CONFIG, [param.name]: value };
      return { pct, value, sharpe: sharpeFor(candles, config) };
    });
    report[param.name] = { base: param.base, baseSharpe, neighbors, classification: classify(baseSharpe, neighbors) };
  }

  // SMA(200) regime period: `regime.ts` hardcodes LONG_TERM_TREND_SMA_PERIOD=200 as a module
  // constant, not exposed through TrendPullbackConfig — frozen, never edited in place to make it
  // parameterizable. Audited instead via the INDEPENDENT reproduction, which §1 of this block
  // already proved produces IDENTICAL trades/positions/metrics to the original (0 unexplained
  // discrepancies) — a validated, trustworthy stand-in specifically for this one perturbation the
  // original's own public surface cannot express without modifying frozen code.
  const repInputs: R3bBarInput[] = bars.map((b) => ({ date: b.date, adjClose: b.adjClose }));
  function repSharpeFor(regimeSmaPeriod: number): number | undefined {
    const result = runR3bIndependentReproduction(repInputs, { ...R3B_ORIGINAL_CONFIG, regimeSmaPeriod });
    const monthly = aggregateMonthly(result.daily.map((d) => d.date), result.daily.map((d) => d.netReturn));
    return computeMonthlyReturnMetrics(monthly).sharpeRatio;
  }
  const repBaseSharpe = repSharpeFor(REGIME_SMA_PERIOD_BASE)!;
  const regimeSmaNeighbors = [-10, -5, 5, 10].map((pct) => {
    const value = REGIME_SMA_PERIOD_BASE + Math.round(REGIME_SMA_PERIOD_BASE * (pct / 100));
    return { pct, value, sharpe: repSharpeFor(value) };
  });
  report["regimeSmaPeriod (via validated independent reproduction)"] = {
    base: REGIME_SMA_PERIOD_BASE,
    baseSharpe: repBaseSharpe,
    neighbors: regimeSmaNeighbors,
    classification: classify(repBaseSharpe, regimeSmaNeighbors),
  };

  writeFileSync(join(OUTPUT_DIR, "continuous-parameters.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
