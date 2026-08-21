import { describe, expect, it } from "vitest";
import { runPortfolioBacktest } from "@/core/portfolio-research/portfolio-engine";
import type { AlignedReturns } from "@/core/portfolio-research/alignment";
import type { RawSignalMap } from "@/core/portfolio-research/family-signals";

function fixedAligned(returns: number[], vol = 0.1): AlignedReturns {
  const monthKeys = returns.map((_, i) => `2020-${String(i + 1).padStart(2, "0")}`);
  return {
    monthKeys,
    byInstrument: {
      EURUSD: returns.map((value, i) => ({
        monthEnd: `2020-${String(i + 1).padStart(2, "0")}-28`,
        signalMonthEnd: `2020-${String(i === 0 ? 1 : i).padStart(2, "0")}-28`,
        value,
        trailingAnnualizedVol: vol,
      })),
    },
  };
}

describe("runPortfolioBacktest", () => {
  it("with no signal, every period is flat (zero gross/net return, zero turnover)", () => {
    const aligned = fixedAligned([0.01, -0.02, 0.03]);
    const signals: RawSignalMap[] = [{}, {}, {}];
    const result = runPortfolioBacktest(aligned, signals, { experimentId: "t", costScenario: "REALISTIC", includeCarry: false });
    for (const p of result.periods) {
      expect(p.grossReturn).toBe(0);
      expect(p.netReturn).toBe(0);
      expect(p.turnover).toBe(0);
      expect(p.activeLegs).toBe(0);
    }
  });

  it("GROSS return is always >= NET return in magnitude terms — cost only ever subtracts", () => {
    const aligned = fixedAligned([0.02, 0.01, -0.01]);
    const signals: RawSignalMap[] = [{ EURUSD: 1 }, { EURUSD: 1 }, { EURUSD: -1 }];
    const result = runPortfolioBacktest(aligned, signals, { experimentId: "t", costScenario: "STRESSED", includeCarry: false });
    for (const p of result.periods) {
      expect(p.netReturn).toBeLessThanOrEqual(p.grossReturn + 1e-12);
      expect(p.costDrag).toBeGreaterThanOrEqual(0);
    }
  });

  it("a higher trailing volatility produces a SMALLER position weight for the same raw signal (vol-normalization)", () => {
    const lowVol = fixedAligned([0.01, 0.01], 0.05);
    const highVol = fixedAligned([0.01, 0.01], 0.4);
    const signals: RawSignalMap[] = [{ EURUSD: 1 }, { EURUSD: 1 }];
    const lowVolResult = runPortfolioBacktest(lowVol, signals, { experimentId: "t", costScenario: "OPTIMISTIC", includeCarry: false });
    const highVolResult = runPortfolioBacktest(highVol, signals, { experimentId: "t", costScenario: "OPTIMISTIC", includeCarry: false });
    const lowVolWeight = lowVolResult.positions.find((p) => p.instrument === "EURUSD")!.weight;
    const highVolWeight = highVolResult.positions.find((p) => p.instrument === "EURUSD")!.weight;
    expect(Math.abs(lowVolWeight)).toBeGreaterThan(Math.abs(highVolWeight));
  });

  it("costScenario does not affect grossReturn — only netReturn/costDrag change across scenarios", () => {
    const aligned = fixedAligned([0.02, -0.01, 0.015]);
    const signals: RawSignalMap[] = [{ EURUSD: 1 }, { EURUSD: -1 }, { EURUSD: 1 }];
    const optimistic = runPortfolioBacktest(aligned, signals, { experimentId: "t", costScenario: "OPTIMISTIC", includeCarry: false });
    const stressed = runPortfolioBacktest(aligned, signals, { experimentId: "t", costScenario: "STRESSED", includeCarry: false });
    expect(optimistic.periods.map((p) => p.grossReturn)).toEqual(stressed.periods.map((p) => p.grossReturn));
    expect(optimistic.periods.map((p) => p.netReturn)).not.toEqual(stressed.periods.map((p) => p.netReturn));
  });

  it("carry return is included in GROSS (not treated as a cost) when includeCarry is true", () => {
    const aligned = fixedAligned([0, 0]);
    const signals: RawSignalMap[] = [{ EURUSD: 1 }, { EURUSD: 1 }];
    const carryMap = { EURUSD: new Map([["2020-01", 0.01], ["2020-02", 0.01]]) };
    const withCarry = runPortfolioBacktest(aligned, signals, { experimentId: "t", costScenario: "OPTIMISTIC", includeCarry: true, carryByInstrumentMonthKey: carryMap });
    const withoutCarry = runPortfolioBacktest(aligned, signals, { experimentId: "t", costScenario: "OPTIMISTIC", includeCarry: false });
    // With zero spot return, gross return with carry must be strictly
    // positive (the OBSERVED differential), unlike without carry (flat).
    expect(withCarry.periods[0].grossReturn).toBeGreaterThan(0);
    expect(withoutCarry.periods[0].grossReturn).toBe(0);
  });
});
