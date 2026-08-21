import type { Currency, FxInstrument } from "@/core/portfolio-research/types";

/**
 * Every instrument's (longCurrency, shortCurrency, signConvention).
 * `signConvention: 1` means the raw price return already reads as
 * "longCurrency vs shortCurrency" (e.g. EURUSD rising = EUR
 * strengthening vs USD). `signConvention: -1` means the pair is quoted
 * the other way around (e.g. USDJPY rising = USD strengthening vs JPY,
 * i.e. JPY WEAKENING vs USD — the raw return must be negated to read as
 * "JPY vs USD").
 */
export interface InstrumentDefinition {
  instrument: FxInstrument;
  longCurrency: Currency;
  shortCurrency: Currency;
  signConvention: 1 | -1;
}

export const INSTRUMENTS: Record<FxInstrument, InstrumentDefinition> = {
  EURUSD: { instrument: "EURUSD", longCurrency: "EUR", shortCurrency: "USD", signConvention: 1 },
  GBPUSD: { instrument: "GBPUSD", longCurrency: "GBP", shortCurrency: "USD", signConvention: 1 },
  USDJPY: { instrument: "USDJPY", longCurrency: "JPY", shortCurrency: "USD", signConvention: -1 },
  AUDUSD: { instrument: "AUDUSD", longCurrency: "AUD", shortCurrency: "USD", signConvention: 1 },
  USDCAD: { instrument: "USDCAD", longCurrency: "CAD", shortCurrency: "USD", signConvention: -1 },
  USDCHF: { instrument: "USDCHF", longCurrency: "CHF", shortCurrency: "USD", signConvention: -1 },
  NZDUSD: { instrument: "NZDUSD", longCurrency: "NZD", shortCurrency: "USD", signConvention: 1 },
  EURGBP: { instrument: "EURGBP", longCurrency: "EUR", shortCurrency: "GBP", signConvention: 1 },
  EURJPY: { instrument: "EURJPY", longCurrency: "EUR", shortCurrency: "JPY", signConvention: 1 },
  GBPJPY: { instrument: "GBPJPY", longCurrency: "GBP", shortCurrency: "JPY", signConvention: 1 },
  AUDJPY: { instrument: "AUDJPY", longCurrency: "AUD", shortCurrency: "JPY", signConvention: 1 },
};

/** The 7 majors — each expresses exactly one non-USD currency's return vs USD. This is the cross-sectional universe for Families 1/3/5 (carry/value/factor-momentum need a per-CURRENCY, not per-pair, basis — rates and CPI are published per currency). */
export const MAJOR_INSTRUMENTS: FxInstrument[] = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"];

/** All 11 — majors + 4 liquid crosses, used only by Family 4's universe-breadth robustness check (F4-F), where bilateral (not vs-USD) trend signals are the natural unit per Moskowitz, Ooi & Pedersen (2012). */
export const FULL_INSTRUMENTS: FxInstrument[] = [...MAJOR_INSTRUMENTS, "EURGBP", "EURJPY", "GBPJPY", "AUDJPY"];

export const NON_USD_CURRENCIES: Currency[] = ["EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"];
