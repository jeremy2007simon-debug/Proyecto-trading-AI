import { createRsi, createSma } from "@/core/indicators";
import type { Candle } from "@/core/market-data/types";
import { swingTurnoverCost, swingTurnoverCostFlat, type CostScenario } from "@/core/us-index-research/cost-model";
import { buildRegimeSeries, regimePasses, type RegimeFilterMode } from "@/core/us-index-research/regime";

/**
 * Block 8.3, Family 3 — Regime-Dependent Trend/Pullback.
 *
 * HYPOTHESIS: buying a pullback (RSI(14) dipping oversold then
 * recovering) inside an established uptrend (rising SMA(50)) performs
 * better, and with a shallower drawdown, when restricted to regimes
 * this strategy is a priori compatible with (a bullish long-term trend
 * and/or a calm realized-vol regime) than when run unconditionally. A
 * genuine regime-CONDITIONAL claim, not a claim that pullback-buying
 * works everywhere.
 *
 * Construction = RegimeFilter (`regime.ts`, ≤2 conditions) + TrendSignal
 * (SMA(50) rising) + PullbackEntry (RSI(14) crosses back up through
 * `entryRsiThreshold` after having been below it — a genuine
 * dip-and-resume, not just "RSI is low"). Long/cash only, no shorting.
 *
 * CAUSAL, ONE-DAY-LAG BY CONSTRUCTION (same convention as
 * `vol-target.ts`): the entry/exit DECISION for day `i` is made from
 * indicator values known at the close of day `i-1`, and applied to day
 * `i`'s own return — so a decision never uses the same day's return it
 * then earns.
 */
export interface TrendPullbackConfig {
  smaTrendPeriod: number;
  smaSlopeLookbackDays: number;
  rsiPeriod: number;
  entryRsiThreshold: number;
  exitRsiThreshold: number;
  maxHoldDays: number;
  regimeFilterMode: RegimeFilterMode;
}

export interface TrendPullbackDayResult {
  date: string;
  inPosition: boolean;
  grossReturn: number;
  costDrag: number;
  netReturn: number;
  turnover: number;
}

export function runTrendPullbackBacktest(candles: readonly Candle[], config: TrendPullbackConfig, scenario: CostScenario, flatCostBpsOverride?: number): TrendPullbackDayResult[] {
  const sma = createSma(config.smaTrendPeriod).compute(candles);
  const smaByTs = new Map(sma.map((v) => [v.timestamp, v.value]));
  const rsi = createRsi(config.rsiPeriod).compute(candles);
  const rsiByTs = new Map(rsi.map((v) => [v.timestamp, v.value]));
  const regime = buildRegimeSeries(candles);

  interface DailyReading {
    date: string;
    close: number;
    trendRising: boolean | undefined;
    rsi: number | undefined;
    regimeOk: boolean;
  }
  const readings: DailyReading[] = [];
  for (let i = 0; i < candles.length; i++) {
    const ts = candles[i].timestamp;
    const smaNow = smaByTs.get(ts);
    const smaPastTs = i >= config.smaSlopeLookbackDays ? candles[i - config.smaSlopeLookbackDays].timestamp : undefined;
    const smaPast = smaPastTs ? smaByTs.get(smaPastTs) : undefined;
    readings.push({
      date: ts.slice(0, 10),
      close: candles[i].close,
      trendRising: smaNow !== undefined && smaPast !== undefined ? smaNow > smaPast : undefined,
      rsi: rsiByTs.get(ts),
      regimeOk: regimePasses(regime, ts.slice(0, 10), config.regimeFilterMode),
    });
  }

  const results: TrendPullbackDayResult[] = [];
  let inPosition = false;
  let daysHeld = 0;
  let previousPositionFlag = 0;

  for (let i = 1; i < readings.length; i++) {
    const prior = readings[i - 1]; // decision inputs: known by close of day i-1
    const today = readings[i];
    const dailyReturn = today.close / prior.close - 1;

    // Decide TOMORROW's-from-prior's-perspective state using `prior`'s own indicator readings — applied to `today`'s return.
    if (inPosition) {
      daysHeld += 1;
      const exitOnRsi = prior.rsi !== undefined && prior.rsi >= config.exitRsiThreshold;
      const exitOnTrendBreak = prior.trendRising === false;
      const exitOnMaxHold = daysHeld >= config.maxHoldDays;
      if (exitOnRsi || exitOnTrendBreak || exitOnMaxHold) {
        inPosition = false;
        daysHeld = 0;
      }
    } else if (prior.trendRising === true && prior.regimeOk && prior.rsi !== undefined) {
      const priorPrior = readings[i - 2];
      const wasOversold = priorPrior?.rsi !== undefined && priorPrior.rsi < config.entryRsiThreshold;
      const resumedNow = prior.rsi >= config.entryRsiThreshold;
      if (wasOversold && resumedNow) {
        inPosition = true;
        daysHeld = 0;
      }
    }

    const positionFlag = inPosition ? 1 : 0;
    const turnover = Math.abs(positionFlag - previousPositionFlag);
    const costDrag = flatCostBpsOverride !== undefined ? swingTurnoverCostFlat(turnover, flatCostBpsOverride) : swingTurnoverCost(turnover, scenario);
    const grossReturn = positionFlag * dailyReturn;
    results.push({ date: today.date, inPosition, grossReturn, costDrag, netReturn: grossReturn - costDrag, turnover });
    previousPositionFlag = positionFlag;
  }
  return results;
}
