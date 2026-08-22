import { runRelativeStrengthBacktest, type RelativeStrengthAssetInput } from "@/core/backtesting/research/relative-strength";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { toAdjustedCandles } from "@/core/us-index-research/daily-series";
import type { UsIndexDailyBar, UsIndexMarket } from "@/core/us-index-research/types";

/**
 * Block 8.3 — reconstructs RS3M_CANDIDATE_V1's OWN monthly return
 * series, READ-ONLY, for use ONLY as a correlation/portfolio-simulation
 * BENCHMARK (§13, §21 of the brief: "también contra RS3M_CANDIDATE_V1
 * pero SOLO como benchmark. No reutilizar su lógica [para construir
 * nuevas estrategias]"). This file:
 *   - IMPORTS `RS3M_CANDIDATE_V1`'s frozen definition (lookback=3
 *     months, SPY/QQQ/IWM/DIA, single-winner-100%) — never redefines
 *     or edits it.
 *   - Calls the EXISTING, ALREADY-TESTED
 *     `runRelativeStrengthBacktest` — the SAME function
 *     `rs3m-engine.ts` itself calls for its live signal — so this
 *     reconstruction can never silently diverge from RS3M's real
 *     behavior.
 *   - Writes NOTHING back to `src/core/paper-trading/rs3m/**` or
 *     `scripts/block6/**` — this module is imported BY Block 8.3's own
 *     scripts only; nothing under `rs3m/` imports anything from
 *     `us-index-research/`. `rs3m-isolation.test.ts` asserts this
 *     one-way dependency direction.
 *   - Never used to build, tune, or filter any of the 30 new Family
 *     1-5 configurations — only to compute a comparison series after
 *     each family's OWN signal has already been run.
 */
export interface Rs3mBenchmarkResult {
  months: string[];
  monthlyReturnsPct: number[];
}

export function buildRs3mBenchmarkSeries(barsByTicker: Readonly<Record<UsIndexMarket, readonly UsIndexDailyBar[]>>): Rs3mBenchmarkResult {
  const tickerByMarket: Record<string, UsIndexMarket> = { SP500: "SPY", NASDAQ100: "QQQ", RUSSELL2000: "IWM", DOWJONES: "DIA" };

  const assets: RelativeStrengthAssetInput[] = RS3M_CANDIDATE_V1.universe.map((market) => {
    const ticker = tickerByMarket[market];
    return { market, candles: toAdjustedCandles(barsByTicker[ticker], ticker) };
  });

  const run = runRelativeStrengthBacktest(assets, {
    lookbackMonths: RS3M_CANDIDATE_V1.lookbackMonths,
    benchmarkMarket: "SP500",
  });

  return {
    months: run.periods.map((p) => p.holdMonth),
    monthlyReturnsPct: run.periods.map((p) => p.periodReturnPct),
  };
}
