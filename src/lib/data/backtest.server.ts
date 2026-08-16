import "server-only";

import { createRuleBasedDataQualityEngine } from "@/core/data-quality/rule-based-data-quality-engine";
import type { DataQualityReport } from "@/core/data-quality/types";
import { toMarketDataValidFlag } from "@/core/data-quality/types";
import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import type { Candle } from "@/core/market-data/types";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import {
  BacktestSimulationError,
  type BacktestConfig,
  type BacktestMetrics,
  type BacktestRun,
} from "@/core/backtesting/types";
import { computeBuyAndHoldBaseline } from "@/core/backtesting/baseline-buy-and-hold";
import { createEventDrivenBacktestEngine } from "@/core/backtesting/event-driven-simulator";
import type { Result } from "@/core/shared/types";
import { getCandlesInRange } from "@/lib/data/market-candles.repository";
import { insertBacktestRun } from "@/lib/data/backtest-runs.repository";

export interface BacktestUnavailable {
  reason: string;
  /** Populated only when the failure was a data quality FAIL (not a fetch/config failure) — lets callers still surface the full report. */
  dataQuality?: DataQualityReport;
}

export interface BacktestRunOutcome {
  run: BacktestRun;
  /**
   * Buy & Hold SPY over the exact same candle range, as a comparison
   * baseline (point 25) — NOT directly comparable to the strategy's
   * R-based, risk-managed metrics beyond `netProfit`/`returnPct`/
   * `maxDrawdownPct` (see `computeBuyAndHoldBaseline`'s docstring).
   * `undefined` only if the run failed before candles were fetched.
   */
  baseline?: BacktestMetrics;
}

/**
 * Fetches candles for the requested market/timeframe/date range (DB
 * first, falling back to a direct provider fetch when the DB doesn't
 * have the range yet — same fallback pattern as `getMarketOverview`),
 * runs the Data Quality Engine gate BEFORE simulating (point 26 — a
 * quality FAIL must never reach the simulator), then runs the pure
 * event-driven engine and persists the result best-effort. Never falls
 * back to mock/synthetic data on any failure — returns a typed
 * "unavailable" result instead, same fail-safe boundary as the rest of
 * this codebase's `src/lib/data/*.server.ts` orchestrators.
 *
 * A `BacktestSimulationError` thrown by the engine itself (point 26's
 * OTHER failure conditions — timestamp disorder, strategy error, etc.)
 * is NOT treated as "unavailable": it's a normal, informative outcome
 * (`BacktestRun.status === "FAILED"` with `errorMessage` set), returned
 * as `{ ok: true, value: run }` — the orchestration itself succeeded,
 * it just has bad news about this particular configuration.
 */
export async function runSingleStrategyBacktest(
  config: BacktestConfig,
): Promise<Result<BacktestRunOutcome, BacktestUnavailable>> {
  let candles: Candle[] = await getCandlesInRange({
    market: config.market,
    timeframe: config.timeframe,
    from: config.dateFrom,
    to: config.dateTo,
  }).catch((err: unknown) => {
    console.error("[backtest] failed to read candles from the database", err);
    return [] as Candle[];
  });

  if (candles.length === 0) {
    const providerResult = createMarketDataProvider();
    if (!providerResult.ok) {
      return { ok: false, error: { reason: providerResult.error.message } };
    }
    const fetchResult = await providerResult.value.getHistoricalCandles({
      market: config.market,
      timeframe: config.timeframe,
      from: config.dateFrom,
      to: config.dateTo,
    });
    if (!fetchResult.ok) {
      return { ok: false, error: { reason: fetchResult.error.message } };
    }
    candles = fetchResult.value;
  }

  if (candles.length === 0) {
    return {
      ok: false,
      error: { reason: `No candles available for ${config.market}/${config.timeframe} between ${config.dateFrom} and ${config.dateTo}.` },
    };
  }

  const calendar = createNyseCalendar(config.market);
  const dataQuality = createRuleBasedDataQualityEngine().evaluate(candles, {
    market: config.market,
    timeframe: config.timeframe,
    calendar,
    now: new Date(candles[candles.length - 1].timestamp),
  });

  if (!toMarketDataValidFlag(dataQuality)) {
    const failedRules = dataQuality.rulesEvaluated
      .filter((r) => !r.passed)
      .map((r) => r.rule)
      .join(", ");
    return {
      ok: false,
      error: { reason: `Data quality check failed: ${failedRules}`, dataQuality },
    };
  }

  const engine = createEventDrivenBacktestEngine();
  let run: BacktestRun;
  try {
    run = engine.run(config, candles);
  } catch (error) {
    if (error instanceof BacktestSimulationError) {
      const now = new Date().toISOString();
      run = {
        id: crypto.randomUUID(),
        config,
        status: "FAILED",
        startedAt: now,
        completedAt: now,
        errorMessage: `${error.code}: ${error.message}`,
        trades: [],
      };
    } else {
      throw error;
    }
  }

  insertBacktestRun(run).catch((err: unknown) => {
    console.error("[backtest] failed to persist backtest run", err);
  });

  const baseline = computeBuyAndHoldBaseline(candles, config.initialCapital);

  return { ok: true, value: { run, baseline } };
}
