import { describe, expect, it } from "vitest";
import { applySwapAdjustment, FX_COST_ASSUMPTIONS, getFxExecutionCostConfig } from "@/core/backtesting/research/forex-cost-presets";
import type { BacktestTrade } from "@/core/backtesting/types";

function trade(overrides: Partial<BacktestTrade>): BacktestTrade {
  return {
    id: "t1",
    market: "FOREX_EURUSD",
    timeframe: "1h",
    direction: "BUY",
    entryPrice: 1.1,
    stopLoss: 1.09,
    entryAt: "2026-01-05T10:00:00.000Z",
    exitAt: "2026-01-05T12:00:00.000Z",
    ambiguousIntrabarExit: false,
    positionSize: 10_000,
    riskAmount: 100,
    commissionPaid: 0,
    slippagePaid: 0,
    entrySlippageAmount: 0,
    entrySpreadAmount: 0,
    exitSlippageAmount: 0,
    exitSpreadAmount: 0,
    rulesTriggered: [],
    ...overrides,
  };
}

describe("getFxExecutionCostConfig — pip math", () => {
  it("EURUSD REALISTIC halfSpread is exactly half the quoted pip spread, in price units", () => {
    const cfg = getFxExecutionCostConfig("FOREX_EURUSD", "REALISTIC");
    const a = FX_COST_ASSUMPTIONS.FOREX_EURUSD;
    expect(cfg.halfSpread).toBeCloseTo((a.spreadPips.realistic * a.pipSize) / 2, 10);
  });

  it("USDJPY uses a 0.01 pip size, not 0.0001 — halfSpread differs by 100x for the same pip count", () => {
    const eurusd = getFxExecutionCostConfig("FOREX_EURUSD", "REALISTIC");
    const usdjpy = getFxExecutionCostConfig("FOREX_USDJPY", "REALISTIC");
    const eurusdPips = FX_COST_ASSUMPTIONS.FOREX_EURUSD.spreadPips.realistic;
    const usdjpyPips = FX_COST_ASSUMPTIONS.FOREX_USDJPY.spreadPips.realistic;
    // Same order of magnitude in PIPS, but halfSpread (price units) uses
    // a pip size 100x larger for JPY — so the ratio of halfSpread to pip
    // count should reflect the 100x pip-size difference.
    expect(usdjpy.halfSpread / usdjpyPips).toBeCloseTo(0.01 / 2, 10);
    expect(eurusd.halfSpread / eurusdPips).toBeCloseTo(0.0001 / 2, 10);
  });

  it("scenario ordering: OPTIMISTIC <= REALISTIC <= STRESSED in both spread and slippage, for every pair", () => {
    for (const market of ["FOREX_EURUSD", "FOREX_GBPUSD", "FOREX_USDJPY", "FOREX_AUDUSD"] as const) {
      const optimistic = getFxExecutionCostConfig(market, "OPTIMISTIC");
      const realistic = getFxExecutionCostConfig(market, "REALISTIC");
      const stressed = getFxExecutionCostConfig(market, "STRESSED");
      expect(optimistic.halfSpread).toBeLessThanOrEqual(realistic.halfSpread);
      expect(realistic.halfSpread).toBeLessThanOrEqual(stressed.halfSpread);
      expect(optimistic.slippagePct).toBeLessThanOrEqual(realistic.slippagePct);
      expect(realistic.slippagePct).toBeLessThanOrEqual(stressed.slippagePct);
    }
  });

  it("commissionPerFill is always 0 (cost carried entirely by spread/slippage — see module docstring)", () => {
    for (const market of ["FOREX_EURUSD", "FOREX_GBPUSD", "FOREX_USDJPY", "FOREX_AUDUSD"] as const) {
      for (const scenario of ["OPTIMISTIC", "REALISTIC", "STRESSED"] as const) {
        expect(getFxExecutionCostConfig(market, scenario).commissionPerFill).toBe(0);
      }
    }
  });
});

describe("applySwapAdjustment", () => {
  it("charges zero swap for a same-day (intraday) trade", () => {
    const t = trade({ entryAt: "2026-01-05T10:00:00.000Z", exitAt: "2026-01-05T14:00:00.000Z" });
    const result = applySwapAdjustment([t], "FOREX_EURUSD", "REALISTIC");
    expect(result.totalSwapCost).toBe(0);
    expect(result.overnightTradeCount).toBe(0);
  });

  it("charges swap proportional to nights held and position size for a multi-day trade", () => {
    const t = trade({ entryAt: "2026-01-05T10:00:00.000Z", exitAt: "2026-01-08T10:00:00.000Z", positionSize: 10_000 });
    const result = applySwapAdjustment([t], "FOREX_EURUSD", "REALISTIC");
    expect(result.overnightTradeCount).toBe(1);
    expect(result.totalSwapCost).toBeLessThan(0); // always a cost, never a credit, in this conservative model
    const a = FX_COST_ASSUMPTIONS.FOREX_EURUSD;
    const expectedNights = 3;
    const expected = -(a.swapPipsPerNight.realistic * a.pipSize) * expectedNights * 10_000;
    expect(result.totalSwapCost).toBeCloseTo(expected, 6);
  });

  it("OPTIMISTIC scenario charges zero swap regardless of holding period", () => {
    const t = trade({ entryAt: "2026-01-05T10:00:00.000Z", exitAt: "2026-01-10T10:00:00.000Z" });
    const result = applySwapAdjustment([t], "FOREX_EURUSD", "OPTIMISTIC");
    expect(result.totalSwapCost).toBe(0);
  });

  it("never produces a positive (credit) swap cost across scenarios", () => {
    const t = trade({ entryAt: "2026-01-05T10:00:00.000Z", exitAt: "2026-01-12T10:00:00.000Z", direction: "SELL" });
    for (const scenario of ["OPTIMISTIC", "REALISTIC", "STRESSED"] as const) {
      const result = applySwapAdjustment([t], "FOREX_GBPUSD", scenario);
      expect(result.totalSwapCost).toBeLessThanOrEqual(0);
    }
  });
});
