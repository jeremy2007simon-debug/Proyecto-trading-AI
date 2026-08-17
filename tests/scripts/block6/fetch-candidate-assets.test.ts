import { describe, expect, it } from "vitest";
import { resolveAlpacaCredentials } from "../../../scripts/block6/lib/fetch-candidate-assets";

describe("resolveAlpacaCredentials (Market Data API)", () => {
  it("returns credentials + feed when fully configured", () => {
    const result = resolveAlpacaCredentials({ ALPACA_API_KEY_ID: "id", ALPACA_API_SECRET_KEY: "secret", ALPACA_FEED: "iex" });
    expect(result).toEqual({ keyId: "id", secretKey: "secret", feed: "iex" });
  });

  it("defaults feed to undefined (caller/adapter falls back to sip) when ALPACA_FEED is unset", () => {
    const result = resolveAlpacaCredentials({ ALPACA_API_KEY_ID: "id", ALPACA_API_SECRET_KEY: "secret" });
    expect(result?.feed).toBeUndefined();
  });

  it("fails closed (undefined) when either credential is missing", () => {
    expect(resolveAlpacaCredentials({ ALPACA_API_SECRET_KEY: "secret" })).toBeUndefined();
    expect(resolveAlpacaCredentials({ ALPACA_API_KEY_ID: "id" })).toBeUndefined();
    expect(resolveAlpacaCredentials({})).toBeUndefined();
  });
});
