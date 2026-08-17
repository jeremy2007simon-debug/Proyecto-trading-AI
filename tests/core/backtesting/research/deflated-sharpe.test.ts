import { describe, expect, it } from "vitest";
import {
  computeKurtosis,
  computeSkewness,
  deflatedSharpeRatio,
  expectedMaxSharpeUnderTrials,
  inverseNormalCdf,
  normalCdf,
  probabilisticSharpeRatio,
} from "@/core/backtesting/research/deflated-sharpe";

describe("normalCdf", () => {
  it("matches known reference values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 3);
  });
});

describe("inverseNormalCdf", () => {
  it("is the inverse of normalCdf at known reference points", () => {
    expect(inverseNormalCdf(0.5)).toBeCloseTo(0, 6);
    expect(inverseNormalCdf(0.975)).toBeCloseTo(1.959964, 3);
    expect(inverseNormalCdf(0.025)).toBeCloseTo(-1.959964, 3);
  });

  it("round-trips through normalCdf", () => {
    for (const p of [0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) {
      expect(normalCdf(inverseNormalCdf(p))).toBeCloseTo(p, 4);
    }
  });
});

describe("computeSkewness / computeKurtosis", () => {
  it("returns 0 skewness and 3 kurtosis for a degenerate (zero-variance) series", () => {
    expect(computeSkewness([1, 1, 1])).toBe(0);
    expect(computeKurtosis([1, 1, 1])).toBe(3);
  });

  it("returns 0 for symmetric series and handles too-small samples", () => {
    expect(computeSkewness([-1, 1])).toBeCloseTo(0, 6);
    expect(computeSkewness([1])).toBe(0);
    expect(computeKurtosis([1])).toBe(3);
  });
});

describe("probabilisticSharpeRatio", () => {
  it("is undefined with fewer than 2 observations", () => {
    expect(probabilisticSharpeRatio({ sharpe: 1, skewness: 0, kurtosis: 3, numObservations: 1 })).toBeUndefined();
  });

  it("reduces to a plain z-test under normal-distribution moments (skew=0, kurtosis=3)", () => {
    const psr = probabilisticSharpeRatio({ sharpe: 0.5, skewness: 0, kurtosis: 3, numObservations: 101, benchmarkSharpe: 0 });
    // denominator = sqrt(1 - 0*0.5 + (3-1)/4*0.25) = sqrt(1.125); z = 0.5*sqrt(100)/sqrt(1.125)
    const expectedZ = (0.5 * Math.sqrt(100)) / Math.sqrt(1.125);
    expect(psr).toBeCloseTo(normalCdf(expectedZ), 6);
  });

  it("a Sharpe of 0 tested against benchmark 0 gives PSR = 0.5", () => {
    const psr = probabilisticSharpeRatio({ sharpe: 0, skewness: 0, kurtosis: 3, numObservations: 50, benchmarkSharpe: 0 });
    expect(psr).toBeCloseTo(0.5, 6);
  });

  it("higher Sharpe yields higher PSR, all else equal", () => {
    const low = probabilisticSharpeRatio({ sharpe: 0.2, skewness: 0, kurtosis: 3, numObservations: 100 })!;
    const high = probabilisticSharpeRatio({ sharpe: 0.8, skewness: 0, kurtosis: 3, numObservations: 100 })!;
    expect(high).toBeGreaterThan(low);
  });
});

describe("expectedMaxSharpeUnderTrials", () => {
  it("is 0 when there is only 1 trial or zero dispersion", () => {
    expect(expectedMaxSharpeUnderTrials(1, 0.5)).toBe(0);
    expect(expectedMaxSharpeUnderTrials(20, 0)).toBe(0);
  });

  it("increases with more trials, all else equal", () => {
    const few = expectedMaxSharpeUnderTrials(5, 0.3);
    const many = expectedMaxSharpeUnderTrials(50, 0.3);
    expect(many).toBeGreaterThan(few);
  });
});

describe("deflatedSharpeRatio", () => {
  it("is lower than the plain PSR (benchmark 0) once more than one trial is accounted for", () => {
    const psr = probabilisticSharpeRatio({ sharpe: 0.6, skewness: 0, kurtosis: 3, numObservations: 100, benchmarkSharpe: 0 })!;
    const dsr = deflatedSharpeRatio({
      sharpe: 0.6,
      skewness: 0,
      kurtosis: 3,
      numObservations: 100,
      numTrials: 24,
      sharpeStdDevAcrossTrials: 0.25,
    })!;
    expect(dsr).toBeLessThan(psr);
  });

  it("equals the plain PSR when numTrials is 1 (no multiple-testing correction needed)", () => {
    const psr = probabilisticSharpeRatio({ sharpe: 0.6, skewness: 0, kurtosis: 3, numObservations: 100, benchmarkSharpe: 0 });
    const dsr = deflatedSharpeRatio({
      sharpe: 0.6,
      skewness: 0,
      kurtosis: 3,
      numObservations: 100,
      numTrials: 1,
      sharpeStdDevAcrossTrials: 0.25,
    });
    expect(dsr).toBeCloseTo(psr!, 9);
  });
});
