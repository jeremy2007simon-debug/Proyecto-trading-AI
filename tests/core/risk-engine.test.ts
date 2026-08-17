import { describe, expect, it } from "vitest";
import { DEFAULT_RISK_RULES } from "@/core/risk-engine/types";

describe("DEFAULT_RISK_RULES", () => {
  it("caps risk per trade at 0.5% as specified", () => {
    expect(DEFAULT_RISK_RULES.maxRiskPerTradePct).toBe(0.5);
  });

  it("caps max daily loss at 1% as specified", () => {
    expect(DEFAULT_RISK_RULES.maxDailyLossPct).toBe(1);
  });

  it("caps max trades per day at 2 as specified", () => {
    expect(DEFAULT_RISK_RULES.maxTradesPerDay).toBe(2);
  });

  it("requires a stop loss on every trade", () => {
    expect(DEFAULT_RISK_RULES.stopLossRequired).toBe(true);
  });

  it("forbids martingale and averaging down", () => {
    expect(DEFAULT_RISK_RULES.allowMartingale).toBe(false);
    expect(DEFAULT_RISK_RULES.allowAveragingDown).toBe(false);
  });
});
