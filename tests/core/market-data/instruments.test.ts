import { describe, expect, it } from "vitest";
import { getInstrumentConfig, INSTRUMENT_CONFIGS } from "@/core/market-data/instruments";
import { ACTIVE_MARKETS } from "@/core/shared/types";

describe("getInstrumentConfig", () => {
  it("returns the SPY ETF config for SP500", () => {
    const result = getInstrumentConfig("SP500");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.value.ticker).toBe("SPY");
    expect(result.value.instrumentType).toBe("ETF");
    expect(result.value.timezone).toBe("America/New_York");
  });

  it("returns an explicit error for a market with no instrument config yet, instead of guessing", () => {
    const result = getInstrumentConfig("GOLD");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error.code).toBe("INSTRUMENT_NOT_CONFIGURED");
  });

  it("every ACTIVE market is configured", () => {
    for (const market of ACTIVE_MARKETS) {
      expect(getInstrumentConfig(market).ok).toBe(true);
    }
  });

  // Block 4.5 (Phase 7) added QQQ/IWM/DIA instrument configs for
  // NASDAQ100/RUSSELL2000/DOWJONES, used only by the cross-asset
  // research scripts — deliberately NOT in ACTIVE_MARKETS, so the live
  // dashboard/production pipeline is unaffected.
  it("the research-only markets (NASDAQ100/RUSSELL2000/DOWJONES) are configured but not active", () => {
    for (const market of ["NASDAQ100", "RUSSELL2000", "DOWJONES"] as const) {
      expect(getInstrumentConfig(market).ok).toBe(true);
      expect(ACTIVE_MARKETS).not.toContain(market);
    }
  });

  it("BITCOIN and GOLD have no instrument config yet (never silently guessed)", () => {
    for (const market of ["BITCOIN", "GOLD"] as const) {
      const result = getInstrumentConfig(market);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected error result");
      expect(result.error.code).toBe("INSTRUMENT_NOT_CONFIGURED");
    }
  });

  it("INSTRUMENT_CONFIGS contains exactly the markets configured so far — SP500, the three equity research-only markets, and the four Block 8 FX pairs", () => {
    expect(Object.keys(INSTRUMENT_CONFIGS).sort()).toEqual([
      "DOWJONES",
      "FOREX_AUDUSD",
      "FOREX_EURUSD",
      "FOREX_GBPUSD",
      "FOREX_USDJPY",
      "NASDAQ100",
      "RUSSELL2000",
      "SP500",
    ]);
  });

  // Block 8 (Forex Research Lab) — same "configured but not active"
  // convention as the equity research-only markets above.
  it("the FX pairs (FOREX_EURUSD/GBPUSD/USDJPY/AUDUSD) are configured but not active", () => {
    for (const market of ["FOREX_EURUSD", "FOREX_GBPUSD", "FOREX_USDJPY", "FOREX_AUDUSD"] as const) {
      expect(getInstrumentConfig(market).ok).toBe(true);
      expect(ACTIVE_MARKETS).not.toContain(market);
    }
  });
});
