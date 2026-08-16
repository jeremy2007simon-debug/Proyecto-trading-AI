import { describe, expect, it } from "vitest";
import { createPositionSizer } from "@/core/risk-engine/position-sizer";

describe("createPositionSizer", () => {
  const sizer = createPositionSizer();

  it("derives position size from equity, risk %, and entry/stop distance", () => {
    // equity=10000, risk=0.5% -> riskAmount=50; entry=100, stop=98 -> stopDistance=2
    // positionSize = 50 / 2 = 25
    const result = sizer.calculate({ accountEquity: 10_000, riskPct: 0.5, entry: 100, stopLoss: 98 });

    expect(result.riskAmount).toBe(50);
    expect(result.stopDistance).toBe(2);
    expect(result.positionSize).toBe(25);
  });

  it("works identically for a SELL (stop above entry)", () => {
    const result = sizer.calculate({ accountEquity: 10_000, riskPct: 0.5, entry: 100, stopLoss: 102 });

    expect(result.stopDistance).toBe(2);
    expect(result.positionSize).toBe(25);
  });

  it("scales linearly with risk %", () => {
    const half = sizer.calculate({ accountEquity: 10_000, riskPct: 0.5, entry: 100, stopLoss: 98 });
    const full = sizer.calculate({ accountEquity: 10_000, riskPct: 1, entry: 100, stopLoss: 98 });

    expect(full.positionSize).toBe(half.positionSize * 2);
    expect(full.riskAmount).toBe(half.riskAmount * 2);
  });

  it("scales linearly with account equity", () => {
    const small = sizer.calculate({ accountEquity: 10_000, riskPct: 0.5, entry: 100, stopLoss: 98 });
    const large = sizer.calculate({ accountEquity: 20_000, riskPct: 0.5, entry: 100, stopLoss: 98 });

    expect(large.positionSize).toBe(small.positionSize * 2);
  });

  it("never divides by zero: a zero stop distance yields a zero position, not Infinity/NaN", () => {
    const result = sizer.calculate({ accountEquity: 10_000, riskPct: 0.5, entry: 100, stopLoss: 100 });

    expect(result.stopDistance).toBe(0);
    expect(result.positionSize).toBe(0);
    expect(Number.isFinite(result.positionSize)).toBe(true);
  });
});
