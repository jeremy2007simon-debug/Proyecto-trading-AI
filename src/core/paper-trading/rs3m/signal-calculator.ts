import { buildMonthlyCloses, monthKey, rankAssetsByTrailingReturn, type RelativeStrengthAssetInput, type AssetRanking } from "@/core/backtesting/research/relative-strength";

/**
 * Block 6, Fase 16 — LIVE signal calculation for RS3M_CANDIDATE_V1.
 *
 * Reuses `rankAssetsByTrailingReturn` — the EXACT SAME ranking function
 * `runRelativeStrengthBacktest` uses internally — so the live signal path
 * and the audited backtest can never silently diverge. This module never
 * reimplements the ranking math; the independent, deliberately-separate
 * reimplementation lives only in the AUDIT script
 * (`scripts/block6/independent-reproduction.ts`), never in the production
 * signal path.
 *
 * No I/O: takes already-fetched candles as input, like every other module
 * in `src/core`. The caller (a script or the engine) is responsible for
 * fetching daily candles from Alpaca with `adjustment: "all"` — the same
 * adjustment `RS3M_CANDIDATE_V1.priceAdjustment` specifies.
 */

export interface Rs3mSignal {
  /** The most recent calendar month with a complete data point across the universe — the decision month. */
  decisionMonth: string;
  /** The real timestamp of the latest candle used to compute this signal (the data cutoff). */
  dataCutoffTimestamp: string;
  /** All universe assets ranked by trailing return, best first. */
  ranking: AssetRanking[];
  /** The top-ranked asset — `undefined` only if no asset had enough trailing history yet. */
  selectedMarket: string | undefined;
}

/**
 * Computes the CURRENT rotation signal from the latest available data: the
 * decision month is simply the most recent calendar month present across
 * `assets`' candles (the caller is expected to have fetched data through
 * "today," so this is naturally the latest complete or in-progress month —
 * see `docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md`'s pipeline section for
 * the scheduler's own rule about WHEN to call this, which is what actually
 * guarantees the month used here is complete). Returns `undefined` if there
 * isn't enough history yet for a `lookbackMonths`-month lookback.
 */
export function computeCurrentRs3mSignal(assets: readonly RelativeStrengthAssetInput[], lookbackMonths: number): Rs3mSignal | undefined {
  const monthlySeriesByMarket = new Map(assets.map((a) => [a.market, buildMonthlyCloses(a.candles)]));
  const allMonths = [...new Set(assets.flatMap((a) => [...monthlySeriesByMarket.get(a.market)!.keys()]))].sort();
  if (allMonths.length <= lookbackMonths) return undefined;

  const decisionMonth = allMonths[allMonths.length - 1];
  const lookbackStartMonth = allMonths[allMonths.length - 1 - lookbackMonths];

  const ranking = rankAssetsByTrailingReturn(
    monthlySeriesByMarket,
    assets.map((a) => a.market),
    lookbackStartMonth,
    decisionMonth,
  );

  const dataCutoffTimestamp = findLatestCandleTimestampInMonth(assets, decisionMonth);

  return { decisionMonth, dataCutoffTimestamp, ranking, selectedMarket: ranking[0]?.market };
}

function findLatestCandleTimestampInMonth(assets: readonly RelativeStrengthAssetInput[], month: string): string {
  let latest = "";
  for (const asset of assets) {
    for (const c of asset.candles) {
      if (monthKey(c.timestamp) === month && c.timestamp > latest) latest = c.timestamp;
    }
  }
  return latest;
}
