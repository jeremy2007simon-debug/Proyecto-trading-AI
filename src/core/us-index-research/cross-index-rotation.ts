import { buildMonthlyCloses, monthKey, rankAssetsByTrailingReturn } from "@/core/backtesting/research/relative-strength";
import { swingTurnoverCost, swingTurnoverCostFlat, type CostScenario } from "@/core/us-index-research/cost-model";
import { buildDailyReturnSeries, toAdjustedCandles } from "@/core/us-index-research/daily-series";
import type { UsIndexDailyBar, UsIndexMarket } from "@/core/us-index-research/types";

/**
 * Block 8.3, Family 4 — Cross-Index Relative Strength / Rotation.
 *
 * IMPORTANT — this is the family most at risk of quietly reinventing
 * RS3M_CANDIDATE_V1 (3-month lookback, single-winner-100%, monthly
 * rotation among SPY/QQQ/IWM/DIA). Every configuration in this file is
 * DELIBERATELY different from that construction in at least one of two
 * ways never both defaulting back to RS3M's own exact combination:
 *   1. SHORTER lookback (1-2 months, never 3 — the brief's own "NO
 *      optimizar alrededor de 3 meses" instruction), reusing the
 *      EXISTING `rankAssetsByTrailingReturn`/monthly-closes machinery
 *      from `relative-strength.ts` UNCHANGED (same raw-return ranking
 *      RS3M uses, just a genuinely different holding horizon — a
 *      distinct economic claim: short tactical persistence vs medium-
 *      term persistence).
 *   2. RISK-ADJUSTED ranking (trailing return / trailing realized vol,
 *      a Sharpe-like score) instead of raw trailing return — a
 *      DIFFERENT signal construction, reusing this module's own
 *      `daily-series.ts` vol computation, never RS3M's code.
 * ...and/or TOP-2 EQUAL-WEIGHT BLEND instead of RS3M's always-
 * single-winner-100% weighting — a structurally different position-
 * sizing rule.
 *
 * `correlateMonthlyReturns` (`portfolio-vs-rs3m.ts`) is what actually
 * checks, quantitatively, whether any of this ends up highly correlated
 * with RS3M despite the construction differences — never assumed from
 * the design alone.
 */
export type RotationRankingMethod = "RAW_RETURN" | "RISK_ADJUSTED";
export type RotationWeighting = "SINGLE_WINNER" | "TOP_2_EQUAL_WEIGHT";

export interface CrossIndexRotationConfig {
  lookbackMonths: number;
  ranking: RotationRankingMethod;
  weighting: RotationWeighting;
}

export interface RotationPeriodResult {
  decisionMonth: string;
  holdMonth: string;
  selectedMarkets: string[];
  grossReturn: number;
  costDrag: number;
  netReturn: number;
  turnover: number;
}

interface AssetInput {
  market: UsIndexMarket;
  bars: readonly UsIndexDailyBar[];
}

/** Month-end -> trailing annualized realized vol (%), from THIS module's own `daily-series.ts` — never RS3M's code. `lookbackDays=63` (~3 trading months) as the vol-estimation window, fixed, not swept — a single documented convention, not a second tunable axis. */
function buildMonthEndVolByMarket(assets: readonly AssetInput[]): Map<UsIndexMarket, Map<string, number>> {
  const result = new Map<UsIndexMarket, Map<string, number>>();
  for (const asset of assets) {
    const points = buildDailyReturnSeries(asset.bars, 63);
    const byMonth = new Map<string, number>();
    for (const p of points) {
      if (p.trailingRealizedVolPct !== undefined) byMonth.set(monthKey(p.date), p.trailingRealizedVolPct);
    }
    result.set(asset.market, byMonth);
  }
  return result;
}

export function runCrossIndexRotationBacktest(assets: readonly AssetInput[], config: CrossIndexRotationConfig, scenario: CostScenario, flatCostBpsOverride?: number): RotationPeriodResult[] {
  const monthlySeriesByMarket = new Map(assets.map((a) => [a.market, buildMonthlyCloses(toAdjustedCandles(a.bars, a.market))]));
  const volByMarket = config.ranking === "RISK_ADJUSTED" ? buildMonthEndVolByMarket(assets) : undefined;
  const allMonths = [...new Set(assets.flatMap((a) => [...monthlySeriesByMarket.get(a.market)!.keys()]))].sort();

  const periods: RotationPeriodResult[] = [];
  let previousSelected: string[] = [];

  for (let i = config.lookbackMonths; i < allMonths.length - 1; i++) {
    const decisionMonth = allMonths[i];
    const holdMonth = allMonths[i + 1];
    const lookbackStartMonth = allMonths[i - config.lookbackMonths];

    const ranking = rankAssetsByTrailingReturn(monthlySeriesByMarket, assets.map((a) => a.market), lookbackStartMonth, decisionMonth);
    const scored = config.ranking === "RAW_RETURN"
      ? ranking
      : ranking
          .map((r) => {
            const vol = volByMarket!.get(r.market as UsIndexMarket)?.get(decisionMonth);
            return { market: r.market, trailingReturnPct: vol !== undefined && vol > 0 ? r.trailingReturnPct / vol : Number.NEGATIVE_INFINITY };
          })
          .sort((a, b) => b.trailingReturnPct - a.trailingReturnPct);

    const n = config.weighting === "SINGLE_WINNER" ? 1 : 2;
    const selected = scored.filter((s) => Number.isFinite(s.trailingReturnPct)).slice(0, n).map((s) => s.market);

    const weight = selected.length > 0 ? 1 / selected.length : 0;
    let grossReturn = 0;
    for (const market of selected) {
      const series = monthlySeriesByMarket.get(market as UsIndexMarket)!;
      const from = series.get(decisionMonth);
      const to = series.get(holdMonth);
      if (from !== undefined && to !== undefined && from > 0) grossReturn += weight * (to / from - 1);
    }

    // Turnover: sum of |weight change| across the union of previously-and-currently-selected markets — the honest generalization of "did the single winner change" to a multi-asset blend.
    const allInvolved = new Set([...previousSelected, ...selected]);
    let turnover = 0;
    for (const market of allInvolved) {
      const prevWeight = previousSelected.includes(market) ? 1 / previousSelected.length : 0;
      const newWeight = selected.includes(market) ? weight : 0;
      turnover += Math.abs(newWeight - prevWeight);
    }
    const costDrag = flatCostBpsOverride !== undefined ? swingTurnoverCostFlat(turnover, flatCostBpsOverride) : swingTurnoverCost(turnover, scenario);

    periods.push({ decisionMonth, holdMonth, selectedMarkets: selected, grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover });
    previousSelected = selected;
  }
  return periods;
}
