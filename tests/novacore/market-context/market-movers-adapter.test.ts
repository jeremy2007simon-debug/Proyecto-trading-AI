import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMarketMovers } from "@/novacore/market-context/adapters/market-movers-adapter";

describe("getMarketMovers", () => {
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

  it("returns one row for every market in the RS3M universe", async () => {
    const movers = await getMarketMovers();
    expect(movers.map((m) => m.market).sort()).toEqual(["DOWJONES", "NASDAQ100", "RUSSELL2000", "SP500"]);
  });

  it("marks every row unavailable — never a fabricated % change — without Market Data credentials", async () => {
    const movers = await getMarketMovers();
    for (const mover of movers) {
      expect(mover.available).toBe(false);
      expect(mover.percentChange).toBeUndefined();
    }
  });
});
