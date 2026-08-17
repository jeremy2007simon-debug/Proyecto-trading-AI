import { describe, expect, it } from "vitest";
import { planRebalance } from "@/core/paper-trading/rs3m/rebalance-planner";

const UNIVERSE = ["SPY", "QQQ", "IWM", "DIA"];

describe("planRebalance", () => {
  it("no-ops when the target asset is already held (no orders, 0% turnover)", () => {
    const plan = planRebalance({
      currentPositions: [{ symbol: "SPY", marketValue: 10000 }],
      universeSymbols: UNIVERSE,
      targetAsset: "SPY",
      totalPortfolioValue: 10000,
    });

    expect(plan.isRebalanceNeeded).toBe(false);
    expect(plan.orders).toEqual([]);
    expect(plan.estimatedTurnoverPct).toBe(0);
  });

  it("plans a single buy order for the very first position (no prior holding)", () => {
    const plan = planRebalance({
      currentPositions: [],
      universeSymbols: UNIVERSE,
      targetAsset: "SPY",
      totalPortfolioValue: 10000,
    });

    expect(plan.isRebalanceNeeded).toBe(true);
    expect(plan.orders).toEqual([{ symbol: "SPY", side: "buy", notionalUsd: 10000, reason: expect.any(String) }]);
    expect(plan.estimatedTurnoverPct).toBe(100);
  });

  it("plans a sell of the old asset AND a buy of the new asset on a genuine switch", () => {
    const plan = planRebalance({
      currentPositions: [{ symbol: "QQQ", marketValue: 12000 }],
      universeSymbols: UNIVERSE,
      targetAsset: "SPY",
      totalPortfolioValue: 12000,
    });

    expect(plan.isRebalanceNeeded).toBe(true);
    expect(plan.orders).toHaveLength(2);
    expect(plan.orders[0]).toMatchObject({ symbol: "QQQ", side: "sell", notionalUsd: 12000 });
    expect(plan.orders[1]).toMatchObject({ symbol: "SPY", side: "buy", notionalUsd: 12000 });
  });

  it("plans a sell-to-cash with NO buy order when the target is undefined (no eligible asset)", () => {
    const plan = planRebalance({
      currentPositions: [{ symbol: "IWM", marketValue: 8000 }],
      universeSymbols: UNIVERSE,
      targetAsset: undefined,
      totalPortfolioValue: 8000,
    });

    expect(plan.isRebalanceNeeded).toBe(true);
    expect(plan.orders).toEqual([{ symbol: "IWM", side: "sell", notionalUsd: 8000, reason: expect.any(String) }]);
  });

  it("ignores positions outside the RS3M universe entirely", () => {
    const plan = planRebalance({
      currentPositions: [{ symbol: "AAPL", marketValue: 5000 }, { symbol: "SPY", marketValue: 10000 }],
      universeSymbols: UNIVERSE,
      targetAsset: "SPY",
      totalPortfolioValue: 15000,
    });

    expect(plan.currentAsset).toBe("SPY");
    expect(plan.isRebalanceNeeded).toBe(false);
    expect(plan.orders).toEqual([]);
  });

  it("stays a no-op when already in cash and the target is still undefined", () => {
    const plan = planRebalance({
      currentPositions: [],
      universeSymbols: UNIVERSE,
      targetAsset: undefined,
      totalPortfolioValue: 10000,
    });

    expect(plan.isRebalanceNeeded).toBe(false);
    expect(plan.orders).toEqual([]);
  });
});
