import { describe, expect, it } from "vitest";
import { reconcileAll, reconcileRebalance, type ExpectedRebalance, type RealizedRebalance } from "@/core/paper-trading/rs3m/backtest-vs-paper";

describe("reconcileRebalance (synthetic fixtures — no real forward data exists yet)", () => {
  it("reports a perfect match: same asset, identical price/notional, fully filled", () => {
    const expected: ExpectedRebalance = { decisionMonth: "2026-08", expectedAsset: "SPY", expectedExecutionPrice: 500, expectedNotionalUsd: 10000 };
    const realized: RealizedRebalance = { decisionMonth: "2026-08", realizedAsset: "SPY", realizedFillPrice: 500, realizedNotionalUsd: 10000, filledQty: 20, orderStatus: "filled" };

    const result = reconcileRebalance(expected, realized);

    expect(result.assetMatch).toBe(true);
    expect(result.executionPriceDeltaPct).toBeCloseTo(0, 6);
    expect(result.notionalDeltaUsd).toBe(0);
    expect(result.fullyFilled).toBe(true);
    expect(result.notes).toEqual([]);
  });

  it("computes a positive slippage percentage when the realized fill price is worse (higher) than expected", () => {
    const expected: ExpectedRebalance = { decisionMonth: "2026-08", expectedAsset: "SPY", expectedExecutionPrice: 500, expectedNotionalUsd: 10000 };
    const realized: RealizedRebalance = { decisionMonth: "2026-08", realizedAsset: "SPY", realizedFillPrice: 505, realizedNotionalUsd: 10000, filledQty: 19.8, orderStatus: "filled" };

    const result = reconcileRebalance(expected, realized);
    expect(result.executionPriceDeltaPct).toBeCloseTo(1, 6);
  });

  it("flags an asset mismatch explicitly with a note, never silently", () => {
    const expected: ExpectedRebalance = { decisionMonth: "2026-08", expectedAsset: "SPY", expectedExecutionPrice: 500, expectedNotionalUsd: 10000 };
    const realized: RealizedRebalance = { decisionMonth: "2026-08", realizedAsset: "QQQ", realizedFillPrice: 700, realizedNotionalUsd: 10000, filledQty: 14.3, orderStatus: "filled" };

    const result = reconcileRebalance(expected, realized);
    expect(result.assetMatch).toBe(false);
    expect(result.notes.some((n) => n.includes("Asset mismatch"))).toBe(true);
  });

  it("reports partial/failed fills with a note and fullyFilled=false", () => {
    const expected: ExpectedRebalance = { decisionMonth: "2026-08", expectedAsset: "SPY", expectedExecutionPrice: 500, expectedNotionalUsd: 10000 };
    const realized: RealizedRebalance = { decisionMonth: "2026-08", realizedAsset: "SPY", realizedFillPrice: 500, realizedNotionalUsd: 5000, filledQty: 10, orderStatus: "partially_filled" };

    const result = reconcileRebalance(expected, realized);
    expect(result.fullyFilled).toBe(false);
    expect(result.notes.some((n) => n.includes("partially_filled"))).toBe(true);
  });

  it("reports undefined comparisons (never fabricated) when the expected side is entirely missing", () => {
    const realized: RealizedRebalance = { decisionMonth: "2026-08", realizedAsset: "SPY", realizedFillPrice: 500, realizedNotionalUsd: 10000, filledQty: 20, orderStatus: "filled" };

    const result = reconcileRebalance(undefined, realized);
    expect(result.assetMatch).toBeUndefined();
    expect(result.executionPriceDeltaPct).toBeUndefined();
    expect(result.notionalDeltaUsd).toBeUndefined();
    expect(result.notes.some((n) => n.includes("No expected"))).toBe(true);
  });

  it("reports undefined comparisons when the realized side is entirely missing (a signal that was never executed)", () => {
    const expected: ExpectedRebalance = { decisionMonth: "2026-08", expectedAsset: "SPY", expectedExecutionPrice: 500, expectedNotionalUsd: 10000 };

    const result = reconcileRebalance(expected, undefined);
    expect(result.assetMatch).toBeUndefined();
    expect(result.fullyFilled).toBe(false);
    expect(result.notes.some((n) => n.includes("No realized"))).toBe(true);
  });
});

describe("reconcileAll (synthetic fixtures)", () => {
  it("reconciles every month present on EITHER side, sorted chronologically", () => {
    const expectedList: ExpectedRebalance[] = [
      { decisionMonth: "2026-07", expectedAsset: "SPY", expectedExecutionPrice: 490, expectedNotionalUsd: 10000 },
      { decisionMonth: "2026-08", expectedAsset: "QQQ", expectedExecutionPrice: 700, expectedNotionalUsd: 10200 },
    ];
    const realizedList: RealizedRebalance[] = [
      { decisionMonth: "2026-07", realizedAsset: "SPY", realizedFillPrice: 491, realizedNotionalUsd: 10000, filledQty: 20.4, orderStatus: "filled" },
      // 2026-09 realized with no matching expected record — must still be reported, not dropped.
      { decisionMonth: "2026-09", realizedAsset: "DIA", realizedFillPrice: 400, realizedNotionalUsd: 9000, filledQty: 22.5, orderStatus: "filled" },
    ];

    const results = reconcileAll(expectedList, realizedList);

    expect(results.map((r) => r.decisionMonth)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(results[0].assetMatch).toBe(true);
    expect(results[1].notes.some((n) => n.includes("No realized"))).toBe(true); // August was expected but never executed
    expect(results[2].notes.some((n) => n.includes("No expected"))).toBe(true); // September was executed but has no ledger record
  });

  it("returns an empty array for two empty lists", () => {
    expect(reconcileAll([], [])).toEqual([]);
  });
});
