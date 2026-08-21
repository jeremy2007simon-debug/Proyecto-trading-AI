import type { DomainError, Market, Result } from "@/core/shared/types";

/**
 * Distinguishes what a "market" is physically backed by. This matters
 * because an index (e.g. the S&P 500 itself) doesn't trade and has no
 * real volume — strategies and VWAP need a real, continuously-traded
 * instrument. Never mix data sourced from different instrument types
 * for the same logical `Market`.
 */
export type InstrumentType = "INDEX" | "ETF" | "FUTURE" | "CFD" | "SPOT";

export interface InstrumentConfig {
  market: Market;
  /** Exact ticker to request from the data provider, e.g. "SPY". */
  ticker: string;
  instrumentType: InstrumentType;
  exchange: string;
  currency: string;
  /** IANA timezone the instrument's primary exchange operates in. */
  timezone: string;
  /** 1 for ETFs/spot instruments; futures-specific otherwise. */
  contractMultiplier?: number;
  description: string;
}

/**
 * Which physical instrument backs each logical `Market`. Deliberately
 * kept in code, not in the `markets` database table: this is a
 * data-sourcing decision tied to whichever provider/instrument type
 * gets chosen, and can change (e.g. switching from an ETF proxy to a
 * futures feed later) without a schema migration. `markets` stays
 * coarse display/activation metadata only.
 *
 * Only `SP500` has an entry today, matching `ACTIVE_MARKETS`
 * (`src/core/shared/types.ts`) — every other market intentionally has
 * no config so `getInstrumentConfig` fails loudly instead of guessing.
 */
export const INSTRUMENT_CONFIGS: Partial<Record<Market, InstrumentConfig>> = {
  SP500: {
    market: "SP500",
    ticker: "SPY",
    instrumentType: "ETF",
    exchange: "ARCX",
    currency: "USD",
    timezone: "America/New_York",
    contractMultiplier: 1,
    description:
      "SPY ETF used as a liquid, continuously-tradable proxy for the S&P 500 " +
      "index. This is NOT the index itself (^GSPC, which has no real trading " +
      "volume) and NOT an ES future or a CFD — see docs/ARCHITECTURE.md.",
  },
  // The three configs below were added in Block 4.5 (Phase 7,
  // cross-asset strategy validation) — same "liquid ETF proxy, not the
  // index itself" convention as SP500/SPY above. None of these three
  // are in `ACTIVE_MARKETS`, so they're reachable only by code that
  // explicitly requests them (the research scripts) — the live
  // dashboard/production pipeline is unaffected.
  NASDAQ100: {
    market: "NASDAQ100",
    ticker: "QQQ",
    instrumentType: "ETF",
    exchange: "XNAS",
    currency: "USD",
    timezone: "America/New_York",
    contractMultiplier: 1,
    description: "QQQ ETF used as a liquid, continuously-tradable proxy for the Nasdaq 100 index.",
  },
  RUSSELL2000: {
    market: "RUSSELL2000",
    ticker: "IWM",
    instrumentType: "ETF",
    exchange: "ARCX",
    currency: "USD",
    timezone: "America/New_York",
    contractMultiplier: 1,
    description: "IWM ETF used as a liquid, continuously-tradable proxy for the Russell 2000 index.",
  },
  DOWJONES: {
    market: "DOWJONES",
    ticker: "DIA",
    instrumentType: "ETF",
    exchange: "ARCX",
    currency: "USD",
    timezone: "America/New_York",
    contractMultiplier: 1,
    description: "DIA ETF used as a liquid, continuously-tradable proxy for the Dow Jones Industrial Average.",
  },
  // Added in Block 8 (Forex Research Lab). FX spot pairs have no single
  // exchange — `exchange: "OTC_SPOT"` and `timezone: "UTC"` are research
  // placeholders, not a claim of a specific venue. `ticker` is the exact
  // symbol requested from the data provider used for this research
  // (Yahoo Finance's unofficial chart API — see
  // `scripts/research/forex/fetch-fx-candles.ts` and
  // `docs/BLOCK8_FOREX_RESEARCH_REPORT.md` for the full data-quality
  // writeup, including the important caveat that this feed is an
  // indicative aggregator price, NOT a measured bid/ask). None of these
  // four are in `ACTIVE_MARKETS` — reachable only by code that explicitly
  // requests them (the Block 8 research scripts), same convention as
  // RUSSELL2000/DOWJONES above.
  FOREX_EURUSD: {
    market: "FOREX_EURUSD",
    ticker: "EURUSD=X",
    instrumentType: "SPOT",
    exchange: "OTC_SPOT",
    currency: "USD",
    timezone: "UTC",
    contractMultiplier: 1,
    description: "EUR/USD spot forex pair. Quote currency USD, pip size 0.0001.",
  },
  FOREX_GBPUSD: {
    market: "FOREX_GBPUSD",
    ticker: "GBPUSD=X",
    instrumentType: "SPOT",
    exchange: "OTC_SPOT",
    currency: "USD",
    timezone: "UTC",
    contractMultiplier: 1,
    description: "GBP/USD spot forex pair. Quote currency USD, pip size 0.0001.",
  },
  FOREX_USDJPY: {
    market: "FOREX_USDJPY",
    ticker: "USDJPY=X",
    instrumentType: "SPOT",
    exchange: "OTC_SPOT",
    currency: "JPY",
    timezone: "UTC",
    contractMultiplier: 1,
    description: "USD/JPY spot forex pair. Quote currency JPY, pip size 0.01 (2 decimal places, not 4).",
  },
  FOREX_AUDUSD: {
    market: "FOREX_AUDUSD",
    ticker: "AUDUSD=X",
    instrumentType: "SPOT",
    exchange: "OTC_SPOT",
    currency: "USD",
    timezone: "UTC",
    contractMultiplier: 1,
    description: "AUD/USD spot forex pair. Quote currency USD, pip size 0.0001.",
  },
};

export function getInstrumentConfig(market: Market): Result<InstrumentConfig, DomainError> {
  const config = INSTRUMENT_CONFIGS[market];
  if (!config) {
    return {
      ok: false,
      error: {
        code: "INSTRUMENT_NOT_CONFIGURED",
        message: `No instrument config exists for market "${market}". Add one to INSTRUMENT_CONFIGS before requesting data for it.`,
      },
    };
  }
  return { ok: true, value: config };
}
