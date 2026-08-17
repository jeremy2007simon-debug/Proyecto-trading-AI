/**
 * Block 6, Fase 12-14 — extended transaction-cost audit, a dedicated
 * slippage model for monthly ETF rotation, and extended Monte Carlo
 * (10,000 sims + block bootstrap) for RS3M_CANDIDATE_V1.
 *
 * Fase 12 (cost audit): sweeps rebalanceCostBps across
 * [0,5,10,20,30,50,75,100], extending automatically to 500 if no
 * break-even crossing is found by 100bps. IMPORTANT DISAMBIGUATION,
 * stated explicitly because the Block 6 spec calls it out: every "bps"
 * figure here is a ROUND-TRIP cost for one rebalance THAT SWITCHES ASSETS
 * (selling the old position + buying the new one), charged once per
 * switch — never a per-individual-order or per-fractional-turnover
 * figure. A rough per-leg (single order) equivalent is `bps / 2`, shown
 * alongside for reference.
 *
 * Fase 13 (slippage model): SPY/QQQ/IWM/DIA are among the most liquid
 * ETFs traded (typical NBBO spreads of a cent or two on $100-500 share
 * prices — well under 1bp of half-spread even before considering that a
 * monthly rebalance is not a time-sensitive market order). This module
 * defines its OWN 3-scenario model, reasoned from that liquidity profile,
 * NOT reused from Block 4.5's 5bps intraday reference (that number was
 * calibrated for a same-day round-trip trade on the same instrument and
 * is not automatically the right number for a monthly ETF swap).
 *
 * Fase 14 (Monte Carlo): uses `monthly-monte-carlo.ts` (promoted in
 * Fase 0/Task 74 from the Block 5 script's inline version) — 10,000
 * simulations, wider percentiles, underperformance probabilities vs SPY
 * and equal-weight, plus a block-bootstrap variant.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block6/audit-costs-and-monte-carlo.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../lib/sandbox-io";
setupSandboxIO();

import { fetchRs3mUniverse, RS3M_BENCHMARK, RS3M_UNIVERSE } from "./lib/fetch-candidate-assets";
import { runRelativeStrengthBacktest, type RelativeStrengthAssetInput } from "@/core/backtesting/research/relative-strength";
import { computeBuyAndHoldMonthlyReturns } from "@/core/backtesting/research/benchmarks";
import { computeBreakEvenCost, type CostSensitivityPoint } from "@/core/backtesting/research/break-even-cost";
import { runMonthlyMonteCarlo, runMonthlyMonteCarloBlockBootstrap } from "@/core/backtesting/research/monthly-monte-carlo";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";

const OUTPUT_DIR = join(process.cwd(), "results", "block6", "costs");
const BASE_COST_SWEEP_BPS = [0, 5, 10, 20, 30, 50, 75, 100];
const EXTENDED_COST_SWEEP_BPS = [150, 200, 300, 400, 500];

/**
 * Fase 13 — 3-scenario slippage model for monthly rotation among
 * SPY/QQQ/IWM/DIA, reasoned explicitly (not copy-pasted from elsewhere):
 * - OPTIMISTIC (2bps round-trip): near-mid-price fills on a single ETF
 *   share order well within typical daily volume, negligible market impact.
 * - REALISTIC (8bps round-trip): accounts for half-spread on both legs
 *   plus a small, conservative market-impact allowance for a notional
 *   rebalance order placed at the open (higher volatility window than
 *   mid-day).
 * - CONSERVATIVE (15bps round-trip): a stress scenario — wider spreads
 *   during elevated volatility (the DOWNTREND/HIGH_VOLATILITY regimes
 *   from Fase 10), plus queue/impact risk from placing at the open.
 * RS3M_CANDIDATE_V1's own `referenceRebalanceCostBps` (20bps) sits ABOVE
 * even the conservative scenario here — a deliberately conservative
 * assumption already baked into the frozen candidate, not tuned to this
 * slippage model after the fact.
 */
const SLIPPAGE_SCENARIOS_BPS = { optimistic: 2, realistic: 8, conservative: 15 } as const;

function sweepCosts(assetInputs: RelativeStrengthAssetInput[], lookbackMonths: number, bpsList: readonly number[]): CostSensitivityPoint[] {
  return bpsList.map((bps) => {
    const run = runRelativeStrengthBacktest(assetInputs, { lookbackMonths, benchmarkMarket: RS3M_BENCHMARK, rebalanceCostBps: bps });
    // No R-multiples exist for a rotation strategy — computeBreakEvenCost
    // is generic over any {bps, signal} series; total return (as a
    // fraction) stands in for expectancyR, same convention Block 5 used.
    return { bps, expectancyR: run.totalReturnPct / 100 };
  });
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("[audit-costs-and-monte-carlo] Fetching adjusted (adjustment=all) daily candles 2016-present...");
  const byMarket = await fetchRs3mUniverse("all", RS3M_CANDIDATE_V1.datasetFrom);
  if (!byMarket) {
    console.error("[audit-costs-and-monte-carlo] Could not fetch data — aborting.");
    process.exitCode = 1;
    return;
  }

  const assetInputs: RelativeStrengthAssetInput[] = RS3M_UNIVERSE.map((market) => ({ market, candles: byMarket.get(market)! }));
  const lookbackMonths = RS3M_CANDIDATE_V1.lookbackMonths;

  // Fase 12: cost sweep + extension if no break-even found within the base range.
  let costPoints = sweepCosts(assetInputs, lookbackMonths, BASE_COST_SWEEP_BPS);
  let breakEven = computeBreakEvenCost(costPoints);
  let extended = false;
  if (breakEven.reason === "POSITIVE_THROUGHOUT_TESTED_RANGE") {
    extended = true;
    costPoints = [...costPoints, ...sweepCosts(assetInputs, lookbackMonths, EXTENDED_COST_SWEEP_BPS)];
    breakEven = computeBreakEvenCost(costPoints);
  }

  const fase12 = {
    costPointsBpsRoundTrip: costPoints,
    costPointsBpsPerOrderEquivalent: costPoints.map((p) => ({ bpsPerOrder: p.bps / 2, expectancyR: p.expectancyR })),
    extendedBeyond100bps: extended,
    breakEven,
    referenceRebalanceCostBps: RS3M_CANDIDATE_V1.referenceRebalanceCostBps,
    note: "Every bps figure above is a ROUND-TRIP cost for one asset-switching rebalance (sell + buy), charged once per switch — see bpsPerOrder for the rough single-leg equivalent (bps/2).",
  };

  // Fase 13: slippage scenarios, run through the SAME engine at each scenario's bps.
  const fase13 = Object.fromEntries(
    Object.entries(SLIPPAGE_SCENARIOS_BPS).map(([scenario, bps]) => {
      const run = runRelativeStrengthBacktest(assetInputs, { lookbackMonths, benchmarkMarket: RS3M_BENCHMARK, rebalanceCostBps: bps });
      return [scenario, { bps, totalReturnPct: run.totalReturnPct, cagrPct: run.cagrPct, maxDrawdownPct: run.maxDrawdownPct }];
    }),
  );

  // Fase 14: extended Monte Carlo at the candidate's own reference cost.
  const referenceRun = runRelativeStrengthBacktest(assetInputs, { lookbackMonths, benchmarkMarket: RS3M_BENCHMARK, rebalanceCostBps: RS3M_CANDIDATE_V1.referenceRebalanceCostBps });
  const rs3mMonthly = referenceRun.periods.map((p) => p.periodReturnPct);
  const decisionAndHoldMonths = [referenceRun.periods[0]?.decisionMonth, ...referenceRun.periods.map((p) => p.holdMonth)].filter((m): m is string => m !== undefined);
  const spyMonthly = computeBuyAndHoldMonthlyReturns({ market: RS3M_BENCHMARK, candles: byMarket.get(RS3M_BENCHMARK)! }, decisionAndHoldMonths);
  const ewRebalancedMonthly = referenceRun.equalWeightEquityCurve.map((pt, i) => {
    const prevEquity = i === 0 ? 1 : referenceRun.equalWeightEquityCurve[i - 1].equity;
    return prevEquity > 0 ? ((pt.equity - prevEquity) / prevEquity) * 100 : 0;
  });

  console.log("[audit-costs-and-monte-carlo] Running 10,000-simulation Monte Carlo (reshuffle)...");
  const reshuffle = runMonthlyMonteCarlo(rs3mMonthly, { benchmarkMonthlyReturnsPct: spyMonthly, equalWeightMonthlyReturnsPct: ewRebalancedMonthly });
  console.log("[audit-costs-and-monte-carlo] Running 10,000-simulation Monte Carlo (block bootstrap)...");
  const blockBootstrap = runMonthlyMonteCarloBlockBootstrap(rs3mMonthly, { benchmarkMonthlyReturnsPct: spyMonthly, equalWeightMonthlyReturnsPct: ewRebalancedMonthly });

  const fase14 = {
    reshuffle,
    blockBootstrap,
    note: "reshuffle draws each simulated month independently with replacement — destroys real month-to-month autocorrelation. blockBootstrap resamples contiguous 4-month blocks — partially preserves it. Both answer 'how much could sequencing alone have hurt/helped,' never a profitability forecast.",
  };

  const report = {
    generatedAt: new Date().toISOString(),
    candidateId: RS3M_CANDIDATE_V1.candidateId,
    fase12_costAudit: fase12,
    fase13_slippageModel: fase13,
    fase14_monteCarlo: fase14,
  };

  writeFileSync(join(OUTPUT_DIR, "costs-and-monte-carlo-report.json"), JSON.stringify(report, null, 2));
  console.log(`\n=== Cost audit + Monte Carlo complete. Report at ${join(OUTPUT_DIR, "costs-and-monte-carlo-report.json")} ===`);
  console.log(`Break-even: ${breakEven.reason} ${breakEven.breakEvenBps !== null ? `(~${breakEven.breakEvenBps.toFixed(1)}bps)` : ""}`);
  console.log(`Monte Carlo (reshuffle) P5/P50/P95 ending equity: ${reshuffle.endingEquity.p5.toFixed(2)} / ${reshuffle.endingEquity.p50.toFixed(2)} / ${reshuffle.endingEquity.p95.toFixed(2)}`);
  console.log(`Probability of underperforming SPY (reshuffle): ${reshuffle.probabilityOfUnderperformingBenchmarkPct?.toFixed(1)}%`);
}

main().catch((error) => {
  console.error("[audit-costs-and-monte-carlo] Unhandled error:", error);
  process.exitCode = 1;
});
