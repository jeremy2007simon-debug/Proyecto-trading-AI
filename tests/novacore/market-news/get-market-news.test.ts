import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMarketNews } from "@/novacore/market-news/adapters/get-market-news";

describe("getMarketNews", () => {
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

  it("reports unavailable — never a fabricated headline — when Market Data credentials aren't configured", async () => {
    const result = await getMarketNews();
    expect(result.available).toBe(false);
    expect(result.items).toEqual([]);
    expect(result.provenance).toBe("UNAVAILABLE");
    expect(result.unavailableReason).toBeTruthy();
  });

  it("explains that it reuses the existing Market Data credentials, not a separate secret", async () => {
    const result = await getMarketNews();
    expect(result.unavailableReason).toContain("ALPACA_API_KEY_ID");
  });

  it("stays unavailable regardless of query filters", async () => {
    const result = await getMarketNews({ category: "FED_RATES", limit: 5 });
    expect(result.available).toBe(false);
  });
});
