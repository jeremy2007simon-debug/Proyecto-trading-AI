import { ATR_14, VOLUME_AVERAGE_20 } from "@/core/indicators";
import type { Candle } from "@/core/market-data/types";
import { getEasternWallClockParts } from "@/core/market-hours/nyse-calendar";
import { INTRADAY_ROUND_TRIP_BPS, type CostScenario } from "@/core/us-index-research/cost-model";
import type { UsIndexIntradayBar, UsIndexMarket } from "@/core/us-index-research/types";
import { US_INDEX_TICKER_TO_MARKET } from "@/core/us-index-research/daily-series";

/**
 * Block 8.3, Family 2 — Intraday Momentum ("Opening Directional
 * Persistence").
 *
 * HYPOTHESIS: within the opening portion of the regular session, a
 * volatility-adjusted directional move (price displacement from the
 * session's own open, scaled by ATR — NOT a fixed opening-RANGE level)
 * that is confirmed by above-average volume tends to persist through
 * the rest of the session. Deliberately distinct from every prior
 * intraday hypothesis already in this codebase:
 *   - Opening Range Breakout (`opening-range-breakout.strategy.ts`,
 *     REJECTED, Block 4): trades a break of a FIXED first-N-minute
 *     high/low LEVEL. This family never computes or trades a range
 *     level — it measures a continuous ATR-normalized displacement.
 *   - VWAP (`vwap.strategy.ts`, `HISTORICAL_UNVALIDATED`, Block 3):
 *     reclaim/rejection/continuation relative to session VWAP. This
 *     family never references VWAP.
 *   - Session Momentum (`session-momentum.strategy.ts`, Block 5,
 *     RESEARCH-tier per Block 5's own funnel): trades ONLY the final
 *     60-ish minutes before the close. This family trades ONLY the
 *     opening window and is flat well before the close in most cases.
 *   - Gap Continuation (`gap-continuation.strategy.ts`, Block 5):
 *     trades the OVERNIGHT gap (today's open vs. yesterday's close).
 *     This family ignores the gap entirely — its reference point is
 *     TODAY's own open.
 *
 * NOT run through the general `Strategy`/event-driven-simulator engine
 * (`@/core/backtesting`): that engine's only forced-exit-at-dataset-end
 * convention (`TIME_EXIT` fires once, at the very last candle of the
 * WHOLE dataset) has no notion of "flat by end of TODAY's session" —
 * confirmed by inspecting `event-driven-simulator.ts` directly, no
 * existing intraday strategy in this codebase actually enforces a
 * daily flat-by-close (`session-momentum.strategy.ts` merely restricts
 * ENTRY to a closing window; it still relies on stop/take-profit or the
 * dataset-end TIME_EXIT for exits). Per this round's own instruction
 * ("Idealmente flat by close salvo justificación fuerte"), a small,
 * DEDICATED, session-aware backtest loop is used instead — same
 * documented rationale as `relative-strength.ts`'s own dedicated engine
 * for monthly rotation (a shape the trade-based engine doesn't fit).
 * Reuses the EXISTING `ATR_14`/`VOLUME_AVERAGE_20` indicators — no new
 * indicator math.
 */
export interface IntradayMomentumConfig {
  /** Number of bars from session open, within which an entry may trigger. */
  openingWindowBars: number;
  /** ATR-normalized displacement from the session open required to trigger (e.g. 1.0 = displacement >= 1x ATR14). */
  moveThresholdAtrMultiple: number;
  /** Current bar volume must be at least this multiple of the trailing 20-bar average to confirm. */
  volumeMultiplier: number;
  atrStopMultiplier: number;
  takeProfitRMultiple: number;
}

export interface IntradayTrade {
  sessionDate: string;
  direction: 1 | -1;
  entryAt: string;
  entryPrice: number;
  exitAt: string;
  exitPrice: number;
  exitReason: "STOP_LOSS" | "TAKE_PROFIT" | "SESSION_CLOSE";
  riskPerShare: number;
  pnlR: number;
  netPnlR: number;
}

function toIntradayCandles(bars: readonly UsIndexIntradayBar[], ticker: UsIndexMarket): Candle[] {
  return bars.map((b) => ({
    market: US_INDEX_TICKER_TO_MARKET[ticker],
    timeframe: "1h",
    timestamp: b.timestamp,
    symbol: ticker,
    provider: "yahoo-intraday",
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
}

/** Groups bars by Eastern CALENDAR trading day (DST-correct via `getEasternWallClockParts`) — never a naive UTC-date split, which would mis-bucket bars near midnight UTC during EDT. */
function groupBySession(candles: readonly Candle[]): Map<string, Candle[]> {
  const sessions = new Map<string, Candle[]>();
  for (const candle of candles) {
    const parts = getEasternWallClockParts(new Date(candle.timestamp));
    const key = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    const list = sessions.get(key);
    if (list) list.push(candle);
    else sessions.set(key, [candle]);
  }
  return sessions;
}

export function runIntradayMomentumBacktest(bars: readonly UsIndexIntradayBar[], ticker: UsIndexMarket, config: IntradayMomentumConfig, scenario: CostScenario): IntradayTrade[] {
  const candles = toIntradayCandles(bars, ticker);
  const atrSeries = ATR_14.compute(candles);
  const atrByTs = new Map(atrSeries.map((v) => [v.timestamp, v.value]));
  const volAvgSeries = VOLUME_AVERAGE_20.compute(candles);
  const volAvgByTs = new Map(volAvgSeries.map((v) => [v.timestamp, v.value]));

  const sessions = groupBySession(candles);
  const trades: IntradayTrade[] = [];
  const roundTripBps = INTRADAY_ROUND_TRIP_BPS[scenario];

  for (const [sessionDate, sessionCandles] of sessions) {
    if (sessionCandles.length < 2) continue;
    const sessionOpen = sessionCandles[0].open;
    let inTrade = false;
    let direction: 1 | -1 = 1;
    let entryPrice = 0;
    let entryAt = "";
    let stopLoss = 0;
    let takeProfit = 0;
    let riskPerShare = 0;

    for (let i = 0; i < sessionCandles.length; i++) {
      const candle = sessionCandles[i];

      if (inTrade) {
        const hitStop = direction === 1 ? candle.low <= stopLoss : candle.high >= stopLoss;
        const hitTarget = direction === 1 ? candle.high >= takeProfit : candle.low <= takeProfit;
        const isLastBarOfSession = i === sessionCandles.length - 1;

        // CONSERVATIVE same-candle policy (matches `SameCandlePolicy` convention elsewhere in this codebase): if a bar touches both stop and target, assume the unfavorable outcome.
        if (hitStop && hitTarget) {
          trades.push(closeTrade(sessionDate, direction, entryAt, entryPrice, candle.timestamp, stopLoss, "STOP_LOSS", riskPerShare, roundTripBps));
          inTrade = false;
        } else if (hitStop) {
          trades.push(closeTrade(sessionDate, direction, entryAt, entryPrice, candle.timestamp, stopLoss, "STOP_LOSS", riskPerShare, roundTripBps));
          inTrade = false;
        } else if (hitTarget) {
          trades.push(closeTrade(sessionDate, direction, entryAt, entryPrice, candle.timestamp, takeProfit, "TAKE_PROFIT", riskPerShare, roundTripBps));
          inTrade = false;
        } else if (isLastBarOfSession) {
          trades.push(closeTrade(sessionDate, direction, entryAt, entryPrice, candle.timestamp, candle.close, "SESSION_CLOSE", riskPerShare, roundTripBps));
          inTrade = false;
        }
        continue;
      }

      if (i >= config.openingWindowBars || i === sessionCandles.length - 1) continue;

      const atr = atrByTs.get(candle.timestamp);
      const volAvg = volAvgByTs.get(candle.timestamp);
      if (atr === undefined || !(atr > 0) || volAvg === undefined || !(volAvg > 0)) continue;

      const displacementAtr = (candle.close - sessionOpen) / atr;
      const volumeConfirmed = candle.volume >= config.volumeMultiplier * volAvg;
      if (Math.abs(displacementAtr) < config.moveThresholdAtrMultiple || !volumeConfirmed) continue;

      // Enter at the NEXT bar's open — never the signal bar's own close — so the entry fill uses a price this backtest could not have known when the signal formed.
      const nextCandle = sessionCandles[i + 1];
      direction = displacementAtr > 0 ? 1 : -1;
      entryPrice = nextCandle.open;
      entryAt = nextCandle.timestamp;
      stopLoss = direction === 1 ? entryPrice - atr * config.atrStopMultiplier : entryPrice + atr * config.atrStopMultiplier;
      riskPerShare = Math.abs(entryPrice - stopLoss);
      takeProfit = direction === 1 ? entryPrice + riskPerShare * config.takeProfitRMultiple : entryPrice - riskPerShare * config.takeProfitRMultiple;
      inTrade = true;
    }
  }

  return trades;
}

function closeTrade(sessionDate: string, direction: 1 | -1, entryAt: string, entryPrice: number, exitAt: string, exitPrice: number, exitReason: IntradayTrade["exitReason"], riskPerShare: number, roundTripBps: number): IntradayTrade {
  const grossPnlPerShare = (exitPrice - entryPrice) * direction;
  const pnlR = riskPerShare > 0 ? grossPnlPerShare / riskPerShare : 0;
  // Half the round-trip cost charged at entry, half at exit — both expressed in the SAME R units as pnlR, scaled by entryPrice (bps is a % of notional/price, R is a % of risk-per-share).
  const costR = riskPerShare > 0 ? (roundTripBps / 10_000) * entryPrice : 0;
  return { sessionDate, direction, entryAt, entryPrice, exitAt, exitPrice, exitReason, riskPerShare, pnlR, netPnlR: pnlR - costR };
}

export interface IntradayMomentumSummary {
  totalTrades: number;
  tradesPerDay: number;
  winRate: number;
  averageR: number;
  averageNetR: number;
  profitFactor: number | undefined;
  expectancyR: number;
  netExpectancyR: number;
}

export function summarizeIntradayTrades(trades: readonly IntradayTrade[], sessionCount: number): IntradayMomentumSummary {
  const n = trades.length;
  if (n === 0) return { totalTrades: 0, tradesPerDay: 0, winRate: 0, averageR: 0, averageNetR: 0, profitFactor: undefined, expectancyR: 0, netExpectancyR: 0 };
  const wins = trades.filter((t) => t.netPnlR > 0);
  const losses = trades.filter((t) => t.netPnlR <= 0);
  const grossWin = wins.reduce((s, t) => s + t.netPnlR, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnlR, 0));
  return {
    totalTrades: n,
    tradesPerDay: sessionCount > 0 ? n / sessionCount : 0,
    winRate: (wins.length / n) * 100,
    averageR: trades.reduce((s, t) => s + t.pnlR, 0) / n,
    averageNetR: trades.reduce((s, t) => s + t.netPnlR, 0) / n,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : undefined,
    expectancyR: trades.reduce((s, t) => s + t.pnlR, 0) / n,
    netExpectancyR: trades.reduce((s, t) => s + t.netPnlR, 0) / n,
  };
}
