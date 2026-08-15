import { describe, expect, it } from "vitest";
import { getInstrumentConfig, INSTRUMENT_CONFIGS } from "@/core/market-data/instruments";

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
    const result = getInstrumentConfig("BITCOIN");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error.code).toBe("INSTRUMENT_NOT_CONFIGURED");
  });

  it("only configures markets that are actually active", () => {
    expect(Object.keys(INSTRUMENT_CONFIGS)).toEqual(["SP500"]);
  });
});
