import { describe, expect, it } from "vitest";
import { resolveAlpacaPaperCredentials } from "../../../../scripts/block6/paper/credentials";

describe("resolveAlpacaPaperCredentials", () => {
  it("returns the credentials when both env vars are present", () => {
    const result = resolveAlpacaPaperCredentials({ ALPACA_PAPER_API_KEY_ID: "PKFAKE123", ALPACA_PAPER_API_SECRET_KEY: "secretvalue" });
    expect(result).toEqual({ keyId: "PKFAKE123", secretKey: "secretvalue" });
  });

  it("fails closed (returns undefined) when ALPACA_PAPER_API_KEY_ID is missing", () => {
    expect(resolveAlpacaPaperCredentials({ ALPACA_PAPER_API_SECRET_KEY: "secretvalue" })).toBeUndefined();
  });

  it("fails closed (returns undefined) when ALPACA_PAPER_API_SECRET_KEY is missing", () => {
    expect(resolveAlpacaPaperCredentials({ ALPACA_PAPER_API_KEY_ID: "PKFAKE123" })).toBeUndefined();
  });

  it("fails closed when both are missing", () => {
    expect(resolveAlpacaPaperCredentials({})).toBeUndefined();
  });

  it("fails closed on an empty-string value (not just undefined)", () => {
    expect(resolveAlpacaPaperCredentials({ ALPACA_PAPER_API_KEY_ID: "", ALPACA_PAPER_API_SECRET_KEY: "secretvalue" })).toBeUndefined();
  });
});
