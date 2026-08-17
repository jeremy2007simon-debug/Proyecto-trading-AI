import { describe, expect, it } from "vitest";
import { createDayState, evaluateDailyRiskGate } from "@/core/backtesting/daily-risk-gate";
import { DEFAULT_RISK_RULES } from "@/core/risk-engine/types";

describe("evaluateDailyRiskGate", () => {
  it("allows a fresh day with no trades and no realized loss", () => {
    const day = createDayState("2024-06-17");
    expect(evaluateDailyRiskGate(day, DEFAULT_RISK_RULES)).toEqual({ allowed: true });
  });

  it("blocks new entries once maxTradesPerDay is reached", () => {
    const day = { dateKey: "2024-06-17", tradesOpened: 2, realizedPnlPct: 0 };
    const result = evaluateDailyRiskGate(day, DEFAULT_RISK_RULES);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Max trades per day");
  });

  it("allows the trade right up to the limit (1 below maxTradesPerDay)", () => {
    const day = { dateKey: "2024-06-17", tradesOpened: 1, realizedPnlPct: 0 };
    expect(evaluateDailyRiskGate(day, DEFAULT_RISK_RULES).allowed).toBe(true);
  });

  it("blocks new entries once the daily loss limit is breached", () => {
    const day = { dateKey: "2024-06-17", tradesOpened: 1, realizedPnlPct: -1.5 };
    const result = evaluateDailyRiskGate(day, DEFAULT_RISK_RULES);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Max daily loss");
  });

  it("blocks exactly at the daily loss limit (<=), not only beyond it", () => {
    const day = { dateKey: "2024-06-17", tradesOpened: 0, realizedPnlPct: -1 };
    expect(evaluateDailyRiskGate(day, DEFAULT_RISK_RULES).allowed).toBe(false);
  });

  it("does not block on a positive or small loss within limits", () => {
    const day = { dateKey: "2024-06-17", tradesOpened: 1, realizedPnlPct: -0.5 };
    expect(evaluateDailyRiskGate(day, DEFAULT_RISK_RULES).allowed).toBe(true);
  });

  it("respects custom rules, not just the defaults", () => {
    const customRules = { ...DEFAULT_RISK_RULES, maxTradesPerDay: 5, maxDailyLossPct: 2 };
    const day = { dateKey: "2024-06-17", tradesOpened: 3, realizedPnlPct: -1.5 };
    expect(evaluateDailyRiskGate(day, customRules).allowed).toBe(true);
  });
});
