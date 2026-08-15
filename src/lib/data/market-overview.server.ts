import "server-only";

import { createRuleBasedDataQualityEngine } from "@/core/data-quality/rule-based-data-quality-engine";
import type { DataQualityReport } from "@/core/data-quality/types";
import { toMarketDataValidFlag } from "@/core/data-quality/types";
import { computeIndicatorSnapshot } from "@/core/indicators";
import type { IndicatorSnapshot } from "@/core/indicators/types";
import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import type { MarketStatus } from "@/core/market-hours/types";
import { createRuleBasedRegimeDetector } from "@/core/market-regime/rule-based-regime-detector";
import type { MarketRegimeRecord, RegimeDetectionResult } from "@/core/market-regime/types";
import type { Market, Result, Timeframe } from "@/core/shared/types";
import { insertRegimeTransition } from "@/lib/data/market-regimes.repository";
import { logDataQualityReport } from "@/lib/data/data-quality-log";

export interface MarketOverview {
  market: Market;
  timeframe: Timeframe;
  price: number;
  lastUpdated: string;
  marketStatus: MarketStatus;
  provider: string;
  indicators: IndicatorSnapshot;
  regime: RegimeDetectionResult;
  dataQuality: DataQualityReport;
  /**
   * The persisted regime row backing `regime`, when persistence
   * succeeded — `persistedRegime.timestamp` is when this regime started,
   * used to display duration. `undefined` only if the write itself
   * failed (e.g. Supabase not configured yet); that never blocks the
   * read path, it just means duration can't be shown.
   */
  persistedRegime?: MarketRegimeRecord;
  /**
   * Milliseconds since `persistedRegime` started, computed once here
   * (server-side, at fetch time) rather than in a component — React
   * components must stay pure and can't call `Date.now()` during
   * render. `undefined` whenever `persistedRegime` is.
   */
  regimeDurationMs?: number;
}

export interface MarketUnavailable {
  reason: string;
  /** Populated only when the failure was a data quality FAIL (not a fetch/config failure) — lets callers still surface the full report. */
  dataQuality?: DataQualityReport;
}

const LOOKBACK_MS = 5 * 24 * 60 * 60 * 1000; // 5 days — enough candles to satisfy every indicator's warmup on intraday timeframes

/**
 * The single function both dashboard pages (Server Components) and API
 * routes call for a live market snapshot. Fetches directly from the
 * configured `MarketDataProvider` (not from `market_candles`) so the
 * dashboard reflects the current market the moment a provider is
 * configured, without depending on a separate ingestion job having run
 * first — persistence (regime transitions, data quality log) still
 * happens here, best-effort, so history accumulates as the dashboard is
 * used, but a persistence failure never blocks the read path.
 *
 * Returns a typed "unavailable" result — never throws, never falls back
 * to mock data — on any failure: unconfigured provider, fetch failure,
 * or a data quality FAIL. This is the fail-safe boundary described in
 * `docs/ARCHITECTURE.md`.
 */
export async function getMarketOverview(
  market: Market,
  timeframe: Timeframe,
): Promise<Result<MarketOverview, MarketUnavailable>> {
  const providerResult = createMarketDataProvider();
  if (!providerResult.ok) {
    return { ok: false, error: { reason: providerResult.error.message } };
  }
  const provider = providerResult.value;

  const now = new Date();
  const candlesResult = await provider.getHistoricalCandles({
    market,
    timeframe,
    from: new Date(now.getTime() - LOOKBACK_MS).toISOString(),
    to: now.toISOString(),
  });
  if (!candlesResult.ok) {
    return { ok: false, error: { reason: candlesResult.error.message } };
  }
  const candles = candlesResult.value;

  const calendar = createNyseCalendar(market);
  const dataQuality = createRuleBasedDataQualityEngine().evaluate(candles, {
    market,
    timeframe,
    calendar,
    now,
  });

  logDataQualityReport(dataQuality).catch((err: unknown) => {
    console.error("[market-overview] failed to log data quality report", err);
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

  const indicators = computeIndicatorSnapshot(candles, calendar);
  const regime = createRuleBasedRegimeDetector().detect({ market, timeframe, candles, indicators });

  const persistedRegime = await insertRegimeTransition(regime).catch((err: unknown) => {
    console.error("[market-overview] failed to persist regime transition", err);
    return undefined;
  });

  const marketStatusResult = await provider.getMarketStatus(market);
  const marketStatus = marketStatusResult.ok ? marketStatusResult.value : calendar.getStatus(now);

  const lastCandle = candles[candles.length - 1];
  const regimeDurationMs = persistedRegime
    ? now.getTime() - new Date(persistedRegime.timestamp).getTime()
    : undefined;

  return {
    ok: true,
    value: {
      market,
      timeframe,
      price: lastCandle.close,
      lastUpdated: lastCandle.timestamp,
      marketStatus,
      provider: provider.id,
      indicators,
      regime,
      dataQuality,
      persistedRegime,
      regimeDurationMs,
    },
  };
}
