import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMarketBenchmarkSeries } from "@/novacore/market-context/adapters/market-benchmark-adapter";

describe("getMarketBenchmarkSeries", () => {
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

  it("reports unavailable — never fabricated prices — for every market in the RS3M universe without credentials", async () => {
    for (const market of ["SP500", "NASDAQ100", "DOWJONES", "RUSSELL2000"] as const) {
      const series = await getMarketBenchmarkSeries(market, "1M");
      expect(series.available).toBe(false);
      expect(series.points).toEqual([]);
      expect(series.provenance).toBe("UNAVAILABLE");
    }
  });

  it("always resolves the correct ETF ticker per market, never the raw index name", async () => {
    expect((await getMarketBenchmarkSeries("SP500", "1D")).ticker).toBe("SPY");
    expect((await getMarketBenchmarkSeries("NASDAQ100", "1D")).ticker).toBe("QQQ");
    expect((await getMarketBenchmarkSeries("DOWJONES", "1D")).ticker).toBe("DIA");
    expect((await getMarketBenchmarkSeries("RUSSELL2000", "1D")).ticker).toBe("IWM");
  });

  it("labels every series with both the market name and its ETF proxy, never conflating the two", async () => {
    const series = await getMarketBenchmarkSeries("SP500", "1D");
    expect(series.label).toContain("S&P 500");
    expect(series.label).toContain("SPY");
  });
});
