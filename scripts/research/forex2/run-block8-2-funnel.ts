/**
 * Block 8.2 — the 24-experiment funnel across Families 1/3/4/5 (Family
 * 2 is DATA_INSUFFICIENT, 0 experiments — see
 * docs/BLOCK8_2_FX_TOP5_DEEP_RESEARCH_REPORT.md §3.5). Every
 * experimentId, its parameters, and its invalidation criteria are
 * FROZEN here — this exact list, unedited since the pre-registration
 * commit that added this file. Adding a new configuration means adding
 * a new experimentId, never editing an existing one after seeing its
 * result (§3 of the brief).
 *
 * Fail-fast, same discipline as Block 8's funnel: Stage 4 (realistic
 * NET cost) failure stops that experiment immediately — no OOS/walk-
 * forward/Monte Carlo is computed for it.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/forex2/run-block8-2-funnel.ts
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

import { classifyCostRobustness, computeBreakEvenCost, type CostSensitivityPoint } from "@/core/backtesting/research/break-even-cost";
import { classifyStrategy, type FunnelSummary } from "@/core/backtesting/research/classification";
import { carryDifferentialMonthly, loadAllRateSeries } from "@/core/portfolio-research/carry";
import { computeRegimeBreakdown, countPositiveRegimes, monthlySampleQuality } from "@/core/portfolio-research/classification-adapter";
import {
  familyFiveSignals,
  familyFourBlendedSignals,
  familyFourSignals,
  familyOneSignals,
  familyThreeSignals,
  type RawSignalMap,
} from "@/core/portfolio-research/family-signals";
import { FULL_INSTRUMENTS, INSTRUMENTS, MAJOR_INSTRUMENTS } from "@/core/portfolio-research/instruments";
import { buildInstrumentReturnSeries } from "@/core/portfolio-research/leg-returns";
import { OOS_HOLDOUT_PCT, splitMonthsChronologically } from "@/core/portfolio-research/oos-split";
import { buildSharedResearchContext } from "@/core/portfolio-research/pipeline";
import { runPortfolioBacktest } from "@/core/portfolio-research/portfolio-engine";
import { computePortfolioMetrics } from "@/core/portfolio-research/portfolio-metrics";
import { runPortfolioMonteCarlo } from "@/core/portfolio-research/portfolio-monte-carlo";
import { buildMonthlyWalkForwardWindows, DEFAULT_MONTHLY_WALK_FORWARD } from "@/core/portfolio-research/walk-forward";
import type { AlignedReturns } from "@/core/portfolio-research/alignment";
import type { FxInstrument } from "@/core/portfolio-research/types";

const OUTPUT_DIR = join(process.cwd(), "results", "block8-2", "experiments");
const MIN_SANITY_MONTHS = 24;

interface ExperimentDefinition {
  experimentId: string;
  family: string;
  hypothesis: string;
  markets: FxInstrument[];
  parameters: Record<string, unknown>;
  invalidationCriteria: string[];
  includeCarry: boolean;
  buildSignals: (aligned: AlignedReturns, ctx: ReturnType<typeof buildSharedResearchContext>) => RawSignalMap[];
}

function gitCommit(): string | undefined {
  try {
    return execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim();
  } catch {
    return undefined;
  }
}

const INVALIDATION_COMMON = [
  "Non-positive NET expectancy at REALISTIC cost.",
  "Break-even cost margin below a defensible safety multiple of the REALISTIC scenario.",
  "OOS or walk-forward-majority failure.",
];

function buildExperiments(): ExperimentDefinition[] {
  const experiments: ExperimentDefinition[] = [];

  // ---- Family 1: FX Factor/Regime Momentum (6) ----
  const f1Configs: { id: string; lookback: number; hold: number; n: number }[] = [
    { id: "F1-A", lookback: 1, hold: 1, n: 2 },
    { id: "F1-B", lookback: 3, hold: 1, n: 2 },
    { id: "F1-C", lookback: 6, hold: 1, n: 2 },
    { id: "F1-D", lookback: 3, hold: 3, n: 2 },
    { id: "F1-E", lookback: 6, hold: 3, n: 2 },
    { id: "F1-F", lookback: 12, hold: 1, n: 2 },
  ];
  for (const c of f1Configs) {
    experiments.push({
      experimentId: c.id,
      family: "1: FX Factor/Regime Momentum",
      hypothesis: "Cross-sectional momentum in currency returns vs USD (Menkhoff, Sarno, Schmeling & Schrimpf 2012).",
      markets: MAJOR_INSTRUMENTS,
      parameters: { lookbackMonths: c.lookback, holdMonths: c.hold, topBottomN: c.n },
      invalidationCriteria: [...INVALIDATION_COMMON, "Momentum crash: >1 catastrophic single-month reversal dominating total return."],
      includeCarry: false,
      buildSignals: (aligned) => familyOneSignals(aligned, c.lookback, c.hold, c.n),
    });
  }

  // ---- Family 3: Carry + Crash/Regime Filter (6) ----
  const f3Configs: { id: string; n: number; mode: "NONE" | "HARD_EXIT" | "SOFT_SCALE"; source: "BASKET_VOL" | "AUDJPY_MOMENTUM"; threshold: number }[] = [
    { id: "F3-A", n: 3, mode: "NONE", source: "BASKET_VOL", threshold: 100 },
    { id: "F3-B", n: 3, mode: "HARD_EXIT", source: "BASKET_VOL", threshold: 80 },
    { id: "F3-C", n: 3, mode: "HARD_EXIT", source: "BASKET_VOL", threshold: 70 },
    { id: "F3-D", n: 3, mode: "SOFT_SCALE", source: "BASKET_VOL", threshold: 80 },
    { id: "F3-E", n: 2, mode: "NONE", source: "BASKET_VOL", threshold: 100 },
    { id: "F3-F", n: 3, mode: "HARD_EXIT", source: "AUDJPY_MOMENTUM", threshold: 80 },
  ];
  for (const c of f3Configs) {
    experiments.push({
      experimentId: c.id,
      family: "3: Carry + Crash/Regime Filter",
      hypothesis: "Interest-rate-differential carry premium, subject to crash risk during funding-liquidity stress (Lustig & Verdelhan 2007; Brunnermeier, Nagel & Pedersen 2008).",
      markets: MAJOR_INSTRUMENTS,
      parameters: { topBottomN: c.n, regimeMode: c.mode, regimeSource: c.source, exitThresholdPercentile: c.threshold },
      invalidationCriteria: [...INVALIDATION_COMMON, "Regime filter fails to reduce crash-period drawdown vs. the unfiltered (F3-A) baseline."],
      includeCarry: true,
      buildSignals: (aligned, ctx) =>
        familyThreeSignals(
          aligned,
          { topBottomN: c.n, regimeMode: c.mode, regimeSource: c.source, exitThresholdPercentile: c.threshold },
          buildInstrumentReturnSeries(ctx.monthlyByInstrument.AUDJPY),
        ).signals,
    });
  }

  // ---- Family 4: Diversified Time-Series Trend Following (6) ----
  const f4Configs: { id: string; lookback: number | "blend"; universe: "MAJORS" | "FULL" }[] = [
    { id: "F4-A", lookback: 1, universe: "MAJORS" },
    { id: "F4-B", lookback: 3, universe: "MAJORS" },
    { id: "F4-C", lookback: 6, universe: "MAJORS" },
    { id: "F4-D", lookback: 12, universe: "MAJORS" },
    { id: "F4-E", lookback: "blend", universe: "MAJORS" },
    { id: "F4-F", lookback: 6, universe: "FULL" },
  ];
  for (const c of f4Configs) {
    const universe = c.universe === "MAJORS" ? MAJOR_INSTRUMENTS : FULL_INSTRUMENTS;
    experiments.push({
      experimentId: c.id,
      family: "4: Diversified Time-Series Trend",
      hypothesis: "Time-series momentum, diversified across a multi-pair basket with vol-normalized sizing (Moskowitz, Ooi & Pedersen 2012).",
      markets: universe,
      parameters: { lookbackMonths: c.lookback, universe: c.universe },
      invalidationCriteria: [...INVALIDATION_COMMON, "Return concentrated in 1-2 pairs (defeats the diversification premise)."],
      includeCarry: false,
      buildSignals: (aligned) =>
        c.lookback === "blend" ? familyFourBlendedSignals(aligned, universe) : familyFourSignals(aligned, universe, c.lookback),
    });
  }

  // ---- Family 5: Multi-Factor FX (6) ----
  const f5Configs: { id: string; weights: { carry: number; trend: number; value: number }; mode: "TOP_BOTTOM_N" | "FULL_UNIVERSE_WEIGHTED"; n?: number }[] = [
    { id: "F5-A", weights: { carry: 1 / 3, trend: 1 / 3, value: 1 / 3 }, mode: "TOP_BOTTOM_N", n: 3 },
    { id: "F5-B", weights: { carry: 0.5, trend: 0.5, value: 0 }, mode: "TOP_BOTTOM_N", n: 3 },
    { id: "F5-C", weights: { carry: 0.5, trend: 0, value: 0.5 }, mode: "TOP_BOTTOM_N", n: 3 },
    { id: "F5-D", weights: { carry: 0, trend: 0.5, value: 0.5 }, mode: "TOP_BOTTOM_N", n: 3 },
    { id: "F5-E", weights: { carry: 1 / 3, trend: 1 / 3, value: 1 / 3 }, mode: "FULL_UNIVERSE_WEIGHTED" },
    { id: "F5-F", weights: { carry: 0.5, trend: 0.3, value: 0.2 }, mode: "TOP_BOTTOM_N", n: 3 },
  ];
  for (const c of f5Configs) {
    experiments.push({
      experimentId: c.id,
      family: "5: Multi-Factor FX",
      hypothesis: "Combining carry, trend, and PPP-value (weakly correlated return sources) improves robustness over any single factor (Asness, Moskowitz & Pedersen 2013).",
      markets: MAJOR_INSTRUMENTS,
      parameters: { weights: c.weights, mode: c.mode, topBottomN: c.n },
      invalidationCriteria: [...INVALIDATION_COMMON, "One factor explains >80% of total return variance (documented, not hidden, per §11)."],
      includeCarry: c.weights.carry > 0,
      buildSignals: (aligned, ctx) => familyFiveSignals(aligned, { weights: c.weights, mode: c.mode, topBottomN: c.n }, ctx.valueZByInstrumentMonthKey),
    });
  }

  return experiments;
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const commit = gitCommit();
  const ctx = buildSharedResearchContext();
  const rates = loadAllRateSeries();
  const experiments = buildExperiments();

  const majorReturnSeriesForRegime = MAJOR_INSTRUMENTS.map((inst) => buildInstrumentReturnSeries(ctx.monthlyByInstrument[inst]));

  for (const exp of experiments) {
    const outputPath = join(OUTPUT_DIR, `${exp.experimentId}.json`);
    if (existsSync(outputPath)) {
      console.log(`[Block 8.2] ${exp.experimentId}: cached, skipping.`);
      continue;
    }
    console.log(`[Block 8.2] Running ${exp.experimentId} (${exp.family}) ...`);

    const aligned = exp.markets.length === MAJOR_INSTRUMENTS.length && exp.markets.every((m) => MAJOR_INSTRUMENTS.includes(m)) ? ctx.alignedMajors : ctx.alignedFull;
    const rawSignals = exp.buildSignals(aligned, ctx);

    const firstActiveIndex = rawSignals.findIndex((s) => Object.keys(s).length > 0);
    if (firstActiveIndex === -1) {
      writeFileSync(outputPath, JSON.stringify({ experimentId: exp.experimentId, exp, classification: "REJECTED", reasons: ["Signal never activated — no month cleared warmup."] }, null, 2));
      continue;
    }
    const trimmedAligned: AlignedReturns = {
      monthKeys: aligned.monthKeys.slice(firstActiveIndex),
      byInstrument: Object.fromEntries(
        Object.entries(aligned.byInstrument).map(([inst, entries]) => [inst, (entries ?? []).slice(firstActiveIndex)]),
      ) as AlignedReturns["byInstrument"],
    };
    const trimmedSignals = rawSignals.slice(firstActiveIndex);

    const carryByInstrumentMonthKey = exp.includeCarry
      ? Object.fromEntries(
          MAJOR_INSTRUMENTS.map((inst) => {
            const { longCurrency, shortCurrency } = INSTRUMENTS[inst];
            return [
              inst,
              new Map(
                trimmedAligned.monthKeys.map((mk, i) => {
                  const asOf = trimmedAligned.byInstrument[inst]?.[i]?.signalMonthEnd ?? mk;
                  return [mk, carryDifferentialMonthly(rates, longCurrency, shortCurrency, asOf) ?? 0];
                }),
              ),
            ];
          }),
        )
      : undefined;

    const grossOnly = runPortfolioBacktest(trimmedAligned, trimmedSignals, {
      experimentId: exp.experimentId,
      costScenario: "OPTIMISTIC",
      includeCarry: exp.includeCarry,
      carryByInstrumentMonthKey,
    });
    const runs = {
      OPTIMISTIC: grossOnly,
      REALISTIC: runPortfolioBacktest(trimmedAligned, trimmedSignals, { experimentId: exp.experimentId, costScenario: "REALISTIC", includeCarry: exp.includeCarry, carryByInstrumentMonthKey }),
      STRESSED: runPortfolioBacktest(trimmedAligned, trimmedSignals, { experimentId: exp.experimentId, costScenario: "STRESSED", includeCarry: exp.includeCarry, carryByInstrumentMonthKey }),
    };

    const grossMetrics = computePortfolioMetrics(runs.OPTIMISTIC.periods, "grossReturn");
    const numMonths = runs.REALISTIC.periods.length;
    const sanityPassed = numMonths >= MIN_SANITY_MONTHS && Number.isFinite(grossMetrics.annualizedReturn);
    const zeroCostExpectancyR = grossMetrics.annualizedReturn;

    const costPoints: CostSensitivityPoint[] = [];
    if (sanityPassed) {
      for (const bps of [0, 1, 2, 3, 5, 8, 12]) {
        const run =
          bps === 0
            ? runs.OPTIMISTIC
            : runPortfolioBacktest(trimmedAligned, trimmedSignals, { experimentId: exp.experimentId, costScenario: "OPTIMISTIC", includeCarry: exp.includeCarry, carryByInstrumentMonthKey, flatCostBpsOverride: bps });
        costPoints.push({ bps, expectancyR: computePortfolioMetrics(run.periods, "netReturn").annualizedReturn });
      }
    }
    const breakEven = costPoints.length > 0 ? computeBreakEvenCost(costPoints) : undefined;

    const realisticMetrics = computePortfolioMetrics(runs.REALISTIC.periods, "netReturn");
    const realisticCostExpectancyR = realisticMetrics.annualizedReturn;
    const survivesStage4 = sanityPassed && realisticCostExpectancyR > 0;

    let oosExpectancyR: number | undefined;
    let walkForwardSummary: { positivePct: number; windowCount: number } | undefined;
    let monteCarlo: ReturnType<typeof runPortfolioMonteCarlo> | undefined;
    let regimeBreakdown: ReturnType<typeof computeRegimeBreakdown> | undefined;
    let longHistorySplit: { firstHalf: number; secondHalf: number } | undefined;

    if (survivesStage4) {
      const split = splitMonthsChronologically(runs.REALISTIC.periods);
      oosExpectancyR = computePortfolioMetrics(split.outOfSample, "netReturn").annualizedReturn;

      const inSample = split.inSample;
      const windows = buildMonthlyWalkForwardWindows(inSample, DEFAULT_MONTHLY_WALK_FORWARD);
      const forwardResults = windows.map((w) => computePortfolioMetrics(w.forward, "netReturn").annualizedReturn);
      walkForwardSummary = { positivePct: forwardResults.length > 0 ? (forwardResults.filter((v) => v > 0).length / forwardResults.length) * 100 : 0, windowCount: windows.length };

      const half = Math.floor(inSample.length / 2);
      longHistorySplit = {
        firstHalf: computePortfolioMetrics(inSample.slice(0, half), "netReturn").annualizedReturn,
        secondHalf: computePortfolioMetrics(inSample.slice(half), "netReturn").annualizedReturn,
      };

      monteCarlo = runPortfolioMonteCarlo(runs.REALISTIC.periods.map((p) => p.netReturn), 10_000, 42);
      regimeBreakdown = computeRegimeBreakdown(runs.REALISTIC.periods, majorReturnSeriesForRegime.map((s) => ({ ...s, returns: s.returns.slice(firstActiveIndex) })));
    }

    const summary: FunnelSummary = {
      sanityPassed,
      zeroCostExpectancyR,
      realisticCostExpectancyR,
      breakEvenBps: breakEven?.breakEvenBps ?? null,
      oosExpectancyR,
      walkForwardPositiveWindowPct: walkForwardSummary?.positivePct,
      walkForwardWindowCount: walkForwardSummary?.windowCount ?? 0,
      sampleQuality: monthlySampleQuality(numMonths),
      crossAssetPositiveCount: 0, // structurally caps classification at CANDIDATE, never VALIDATED — see module docstring and §27 of the report
      crossAssetTestedCount: 0,
      monteCarloDrawdownP95Pct: monteCarlo?.maxDrawdownPct.p95,
      positiveRegimeCount: regimeBreakdown ? countPositiveRegimes(regimeBreakdown) : 0,
    };
    const { classification, reasons } = classifyStrategy(summary);

    writeFileSync(
      outputPath,
      JSON.stringify(
        {
          experimentId: exp.experimentId,
          family: exp.family,
          hypothesis: exp.hypothesis,
          markets: exp.markets,
          parameters: exp.parameters,
          invalidationCriteria: exp.invalidationCriteria,
          createdAt: new Date().toISOString(),
          gitCommit: commit,
          numMonths,
          firstActiveMonth: trimmedAligned.monthKeys[0],
          lastMonth: trimmedAligned.monthKeys[trimmedAligned.monthKeys.length - 1],
          classification,
          reasons,
          grossMetrics,
          costScenarios: {
            OPTIMISTIC: computePortfolioMetrics(runs.OPTIMISTIC.periods, "netReturn"),
            REALISTIC: realisticMetrics,
            STRESSED: computePortfolioMetrics(runs.STRESSED.periods, "netReturn"),
          },
          costSensitivity: costPoints,
          breakEven,
          costRobustness: breakEven ? classifyCostRobustness(breakEven) : undefined,
          oosExpectancyR,
          walkForward: walkForwardSummary,
          longHistorySplit,
          monteCarlo,
          regimeBreakdown,
        },
        null,
        2,
      ),
    );
    console.log(`[Block 8.2] ${exp.experimentId}: ${classification} (${numMonths} months, gross=${zeroCostExpectancyR.toFixed(3)}, net=${realisticCostExpectancyR.toFixed(3)})`);
  }

  console.log(`\n=== Block 8.2 funnel complete. OOS holdout=${OOS_HOLDOUT_PCT}%. Results in ${OUTPUT_DIR} ===`);
}

main().catch((error) => {
  console.error("[block8-2-funnel] Unhandled error:", error);
  process.exitCode = 1;
});
