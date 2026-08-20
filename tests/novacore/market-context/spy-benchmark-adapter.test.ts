import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSpyBenchmarkSeries } from "@/novacore/market-context/adapters/spy-benchmark-adapter";

describe("getSpyBenchmarkSeries", () => {
  const originalKeyId = process.env.ALPACA_API_KEY_ID;
  const originalSecret = process.env.ALPACA_API_SECRET_KEY;

  beforeEach(() => {
    delete process.env.ALPACA_API_KEY_ID;
    delete process.env.ALPACA_API_SECRET_KEY;
  });

  afterEach(() => {
    if (originalKeyId === undefined) delete process.env.ALPACA_API_KEY_ID;
    else process.env.ALPACA_API_KEY_ID = originalKeyId;
    if (originalSecret === undefined) delete process.env.ALPACA_API_SECRET_KEY;
    else process.env.ALPACA_API_SECRET_KEY = originalSecret;
  });

  it("reports unavailable — never a fabricated price series — when Market Data credentials aren't configured", async () => {
    const series = await getSpyBenchmarkSeries("1M");
    expect(series.available).toBe(false);
    expect(series.points).toEqual([]);
    expect(series.provenance).toBe("UNAVAILABLE");
    expect(series.unavailableReason).toBeTruthy();
  });

  it("always labels the ticker as SPY, never the raw index", async () => {
    const series = await getSpyBenchmarkSeries("1D");
    expect(series.ticker).toBe("SPY");
  });

  it("echoes back the requested timeframe", async () => {
    const series = await getSpyBenchmarkSeries("ALL");
    expect(series.timeframe).toBe("ALL");
  });
});
