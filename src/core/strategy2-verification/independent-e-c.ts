import type { Candle } from "@/core/market-data/types";
import { SWING_ROUND_TRIP_BPS, type CostScenario } from "@/core/us-index-research/cost-model";
import type { Strategy2DayResult } from "@/core/strategy2-research/types";
import type { VixPoint } from "@/core/strategy2-research/volatility-risk-premium";

/**
 * Block 9.y — INDEPENDENT reproduction of E-C. Written from the frozen
 * spec (`candidate-specs.ts`) only — ZERO imports from
 * `src/core/strategy2-research/volatility-risk-premium.ts`. Uses a
 * different VIX-percentile rank convention (strict-less-than count,
 * vs. the original's less-than-or-equal count) and a differently
 * structured state machine, so a discrepancy would surface a genuine
 * algorithmic difference.
 *
 * TWO variants are exported:
 *  - `runECIndependentReproduction`: mirrors the ORIGINAL's naive stop
 *    semantics (realized loss capped at exactly -stopLossPct on a
 *    breach) — for a like-for-like reproduction comparison against
 *    Block 9.x's own numbers.
 *  - `runECGapAwareStopModel`: a SEPARATE, explicitly-labeled realistic
 *    analysis per this block's §11 instruction ("a -15% stop does NOT
 *    imply maximum loss = 15%; gap risk must be modeled; never cap
 *    realized loss artificially at the stop threshold"). If today's
 *    OPEN has already gapped through the stop level, the realized exit
 *    is AT THE OPEN (the worst a stop order can do after a gap — it
 *    cannot fill at a price the market never traded at); only an
 *    intraday-only breach (open still above the stop, low breaches it)
 *    is treated as filling at the stop price itself.
 */
export interface EcConfig {
  stopLossPct: number;
  vixPercentileFilterBelow?: number;
}

function independentPercentileRank(values: readonly number[], target: number): number {
  let strictlyBelow = 0;
  for (const v of values) if (v < target) strictlyBelow += 1;
  return strictlyBelow / values.length;
}

interface StopEvent {
  date: string;
  entryPrice: number;
  todayOpen: number;
  todayLow: number;
  naiveRealizedLossPct: number; // always exactly -stopLossPct
  gapAwareRealizedLossPct: number; // -stopLossPct, or worse if the open itself gapped through
  gappedThrough: boolean;
}

function buildFilterSeries(sorted: readonly Candle[], vixSeries: readonly VixPoint[], filterBelow: number | undefined): boolean[] {
  if (filterBelow === undefined) return sorted.map(() => true);
  const sortedVix = [...vixSeries].sort((a, b) => a.date.localeCompare(b.date));
  const vixByDate = new Map(sortedVix.map((v) => [v.date, v.value]));
  const lookback = 252;
  const out: boolean[] = new Array(sorted.length).fill(false);
  let windowStart = 0;
  let windowEnd = 0;
  for (let i = 1; i < sorted.length; i++) {
    const yesterday = sorted[i - 1].timestamp.slice(0, 10);
    while (windowEnd < sortedVix.length && sortedVix[windowEnd].date < yesterday) windowEnd += 1;
    const floorIndex = windowEnd - lookback;
    windowStart = Math.max(windowStart, floorIndex, 0);
    const window = sortedVix.slice(windowStart, windowEnd).map((v) => v.value);
    const yesterdayVix = vixByDate.get(yesterday);
    out[i] = window.length >= 60 && yesterdayVix !== undefined && independentPercentileRank(window, yesterdayVix) <= filterBelow;
  }
  return out;
}

function runCore(candles: readonly Candle[], vixSeries: readonly VixPoint[], config: EcConfig, scenario: CostScenario, gapAware: boolean): { results: Strategy2DayResult[]; stopEvents: StopEvent[] } {
  const sorted = [...candles].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const filterOn = buildFilterSeries(sorted, vixSeries, config.vixPercentileFilterBelow);
  const roundTripFraction = SWING_ROUND_TRIP_BPS[scenario] / 10_000;

  const results: Strategy2DayResult[] = [];
  const stopEvents: StopEvent[] = [];
  let entryPrice: number | undefined;
  let pendingEntryCost = false;

  for (let i = 1; i < sorted.length; i++) {
    const date = sorted[i].timestamp.slice(0, 10);
    const priorClose = sorted[i - 1].close;
    const todayOpen = sorted[i].open;
    const todayLow = sorted[i].low;
    const todayClose = sorted[i].close;
    if (!(priorClose > 0)) continue;

    if (!filterOn[i]) {
      entryPrice = undefined;
      results.push({ date, grossReturn: 0, costDrag: 0, netReturn: 0, turnover: 0 });
      continue;
    }

    if (entryPrice === undefined) {
      entryPrice = priorClose;
      pendingEntryCost = true;
    }

    const lowBreach = todayLow <= entryPrice * (1 - config.stopLossPct);
    if (lowBreach) {
      const openGappedThrough = todayOpen <= entryPrice * (1 - config.stopLossPct);
      const naiveLoss = -config.stopLossPct;
      const gapAwareLoss = openGappedThrough ? todayOpen / entryPrice - 1 : -config.stopLossPct;
      stopEvents.push({ date, entryPrice, todayOpen, todayLow, naiveRealizedLossPct: naiveLoss * 100, gapAwareRealizedLossPct: gapAwareLoss * 100, gappedThrough: openGappedThrough });

      const grossReturn = gapAware ? gapAwareLoss : naiveLoss;
      const entryCost = pendingEntryCost ? roundTripFraction : 0;
      const costDrag = roundTripFraction + entryCost;
      results.push({ date, grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover: entryCost > 0 ? 2 : 1 });
      entryPrice = todayClose;
      pendingEntryCost = true;
      continue;
    }

    const grossReturn = todayClose / priorClose - 1;
    const costDrag = pendingEntryCost ? roundTripFraction : 0;
    results.push({ date, grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover: costDrag > 0 ? 1 : 0 });
    pendingEntryCost = false;
  }
  return { results, stopEvents };
}

export function runECIndependentReproduction(candles: readonly Candle[], vixSeries: readonly VixPoint[], config: EcConfig, scenario: CostScenario): Strategy2DayResult[] {
  return runCore(candles, vixSeries, config, scenario, false).results;
}

export function runECGapAwareStopModel(candles: readonly Candle[], vixSeries: readonly VixPoint[], config: EcConfig, scenario: CostScenario): { results: Strategy2DayResult[]; stopEvents: StopEvent[] } {
  return runCore(candles, vixSeries, config, scenario, true);
}
