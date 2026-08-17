import { getEasternWallClockParts } from "@/core/market-hours/nyse-calendar";
import type { BacktestTrade } from "@/core/backtesting/types";

/**
 * Block 5 — Strategy Similarity (Fase 12). Applied only to strategies
 * that reach CANDIDATE — a future portfolio needs genuinely different
 * edges, not the same signal wearing two names. Small, pure, testable
 * module; never invoked as part of the base 24-configuration funnel.
 */

function dateKeyEastern(iso: string): string {
  const parts = getEasternWallClockParts(new Date(iso));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** Sums `pnlAmount` per Eastern calendar day of `exitAt` (a trade's realized P&L belongs to the day it closed). */
export function buildDailyPnlSeries(trades: readonly BacktestTrade[]): Map<string, number> {
  const series = new Map<string, number>();
  for (const trade of trades) {
    if (!trade.exitAt || trade.pnlAmount === undefined) continue;
    const key = dateKeyEastern(trade.exitAt);
    series.set(key, (series.get(key) ?? 0) + trade.pnlAmount);
  }
  return series;
}

/** Pearson correlation coefficient. `undefined` when there are fewer than 2 paired observations or either series has zero variance (correlation is undefined, not 0, in that case). */
export function pearsonCorrelation(a: readonly number[], b: readonly number[]): number | undefined {
  if (a.length !== b.length || a.length < 2) return undefined;
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let covariance = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    covariance += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return undefined;
  return covariance / Math.sqrt(varA * varB);
}

/**
 * Correlation of daily realized P&L between two strategies, over the
 * UNION of days either one traded (a day only one strategy traded
 * contributes 0 for the other side — documented choice: this measures
 * "how similarly they move on days either is active," not just days both
 * happen to trade).
 */
export function correlateDailyPnl(tradesA: readonly BacktestTrade[], tradesB: readonly BacktestTrade[]): number | undefined {
  const seriesA = buildDailyPnlSeries(tradesA);
  const seriesB = buildDailyPnlSeries(tradesB);
  const allDays = new Set([...seriesA.keys(), ...seriesB.keys()]);
  const a: number[] = [];
  const b: number[] = [];
  for (const day of allDays) {
    a.push(seriesA.get(day) ?? 0);
    b.push(seriesB.get(day) ?? 0);
  }
  return pearsonCorrelation(a, b);
}

interface TimeInterval {
  startMs: number;
  endMs: number;
}

function tradeInterval(trade: BacktestTrade): TimeInterval | undefined {
  if (!trade.exitAt) return undefined;
  return { startMs: new Date(trade.entryAt).getTime(), endMs: new Date(trade.exitAt).getTime() };
}

function intervalOverlapMs(a: TimeInterval, b: TimeInterval): number {
  const start = Math.max(a.startMs, b.startMs);
  const end = Math.min(a.endMs, b.endMs);
  return Math.max(0, end - start);
}

/**
 * % of time-in-market (by duration, not trade count) that overlaps
 * between two trade lists — how often both strategies would have been
 * simultaneously exposed. Denominator is the SMALLER of the two
 * strategies' total time-in-market (documented choice: answers "of the
 * less active strategy's market exposure, how much coincides with the
 * other," which is what matters for portfolio diversification). Returns
 * 0 when either side has no closed trades.
 */
export function computeTimeInMarketOverlapPct(tradesA: readonly BacktestTrade[], tradesB: readonly BacktestTrade[]): number {
  const intervalsA = tradesA.map(tradeInterval).filter((i): i is TimeInterval => i !== undefined);
  const intervalsB = tradesB.map(tradeInterval).filter((i): i is TimeInterval => i !== undefined);

  const totalA = intervalsA.reduce((s, i) => s + (i.endMs - i.startMs), 0);
  const totalB = intervalsB.reduce((s, i) => s + (i.endMs - i.startMs), 0);
  const smallerTotal = Math.min(totalA, totalB);
  if (smallerTotal <= 0) return 0;

  let overlapMs = 0;
  for (const a of intervalsA) {
    for (const b of intervalsB) {
      overlapMs += intervalOverlapMs(a, b);
    }
  }
  return (overlapMs / smallerTotal) * 100;
}
