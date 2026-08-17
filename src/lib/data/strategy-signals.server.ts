import "server-only";

import type { MarketRegime, RegimeDetectionResult } from "@/core/market-regime/types";
import type { Market, Result, Timeframe } from "@/core/shared/types";
import { getDefaultStrategyManager } from "@/core/strategy-manager/registry";
import type {
  StrategyParameters,
  StrategyRegistration,
  StrategySignal,
  StrategySignalRecord,
} from "@/core/strategy-manager/types";
import { getMarketOverview } from "@/lib/data/market-overview.server";
import { logStrategyEvaluationSummary } from "@/lib/data/strategy-manager-log";
import { getStrategySignalHistory, insertStrategySignals } from "@/lib/data/strategy-signals.repository";

/** Static, code-owned metadata for a registered strategy plus its manager-controlled runtime state. */
export interface StrategyRegistrationSummary {
  id: string;
  name: string;
  description: string;
  version: string;
  weight: number;
  compatibleRegimes: readonly MarketRegime[];
  enabled: boolean;
  /** The manager's LIVE parameters for this strategy (defaults, unless overridden via `setParameters` — no UI for that yet in this block). */
  parameters: StrategyParameters;
}

export interface StrategySignalsOverview {
  market: Market;
  timeframe: Timeframe;
  regime: RegimeDetectionResult;
  signals: StrategySignal[];
  registrations: StrategyRegistrationSummary[];
  evaluatedAt: string;
}

export interface StrategySignalsUnavailable {
  reason: string;
}

function toRegistrationSummary(registration: StrategyRegistration): StrategyRegistrationSummary {
  return {
    id: registration.strategy.id,
    name: registration.strategy.name,
    description: registration.strategy.description,
    version: registration.strategy.version,
    weight: registration.weight,
    compatibleRegimes: registration.strategy.compatibleRegimes,
    enabled: registration.enabled,
    parameters: registration.parameters,
  };
}

/**
 * The single function both the Strategy Matrix and API routes call for a
 * live evaluation of every registered strategy. Reuses `getMarketOverview`
 * (candles, indicators, regime, data quality) rather than re-fetching —
 * strategies never run against data that hasn't already cleared the Data
 * Quality Engine gate, and every strategy receives the SAME
 * `marketRegime` from the one Market Regime Detector call (point 15: no
 * strategy is allowed to compute its own independent regime).
 *
 * Never throws, never falls back to mock data — returns a typed
 * "unavailable" result on any upstream failure, propagated straight from
 * `getMarketOverview`.
 */
export async function getStrategySignals(
  market: Market,
  timeframe: Timeframe,
): Promise<Result<StrategySignalsOverview, StrategySignalsUnavailable>> {
  const overview = await getMarketOverview(market, timeframe);
  if (!overview.ok) {
    return { ok: false, error: { reason: overview.error.reason } };
  }

  const manager = getDefaultStrategyManager();
  const signals = manager.generateSignals({
    market,
    timeframe,
    candles: overview.value.candles,
    indicators: overview.value.indicators,
    marketRegime: overview.value.regime.regime,
    parameters: {},
  });

  // Persistence and observability are both best-effort: a Supabase
  // failure here must never block returning the live signals the
  // dashboard is waiting on.
  insertStrategySignals(signals).catch((err: unknown) => {
    console.error("[strategy-signals] failed to persist strategy signals", err);
  });
  logStrategyEvaluationSummary(signals, market, timeframe).catch((err: unknown) => {
    console.error("[strategy-signals] failed to log strategy evaluation summary", err);
  });

  return {
    ok: true,
    value: {
      market,
      timeframe,
      regime: overview.value.regime,
      signals,
      registrations: manager.listRegistrations(market).map(toRegistrationSummary),
      evaluatedAt: new Date().toISOString(),
    },
  };
}

export interface StrategyDetail {
  registration: StrategyRegistrationSummary;
  /** Undefined only when the current live evaluation itself is unavailable (see `overviewUnavailable`). */
  currentSignal?: StrategySignal;
  /** Populated when the live evaluation failed upstream (data quality, provider) — the detail page can still show registration metadata and history. */
  overviewUnavailable?: StrategySignalsUnavailable;
  recentSignals: StrategySignalRecord[];
}

export interface StrategyNotFound {
  reason: string;
}

/**
 * Strategy detail = static registration metadata + the strategy's own
 * signal from the current live evaluation (via `getStrategySignals`, so
 * the Matrix and the detail page are always consistent with each other)
 * + its persisted signal history. No profitability metrics — no real
 * backtests exist yet.
 */
export async function getStrategyDetail(
  strategyId: string,
  market: Market,
  timeframe: Timeframe,
  historyLimit = 50,
): Promise<Result<StrategyDetail, StrategyNotFound>> {
  const manager = getDefaultStrategyManager();
  const registration = manager.getRegistration(strategyId);
  if (!registration) {
    return { ok: false, error: { reason: `Unknown strategy id: ${strategyId}` } };
  }

  const [overview, recentSignals] = await Promise.all([
    getStrategySignals(market, timeframe),
    getStrategySignalHistory(strategyId, market, timeframe, historyLimit).catch((err: unknown) => {
      console.error("[strategy-signals] failed to read strategy signal history", err);
      return [] as StrategySignalRecord[];
    }),
  ]);

  return {
    ok: true,
    value: {
      registration: toRegistrationSummary(registration),
      currentSignal: overview.ok ? overview.value.signals.find((s) => s.strategyId === strategyId) : undefined,
      overviewUnavailable: overview.ok ? undefined : overview.error,
      recentSignals,
    },
  };
}
