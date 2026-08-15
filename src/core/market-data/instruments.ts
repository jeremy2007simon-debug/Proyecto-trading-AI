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
