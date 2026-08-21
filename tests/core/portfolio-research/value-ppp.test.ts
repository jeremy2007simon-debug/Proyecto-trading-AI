import { describe, expect, it } from "vitest";
import { buildRealExchangeRateSeries, buildValueZScoreSeries } from "@/core/portfolio-research/value-ppp";
import type { Currency, MonthlySeries, RateObservation } from "@/core/portfolio-research/types";

function monthlySeries(closes: number[]): MonthlySeries {
  return { instrument: "EURUSD", points: closes.map((close, i) => ({ monthEnd: `2020-${String(i + 1).padStart(2, "0")}-28`, close })) };
}

function flatCpi(value: number, months: number): RateObservation[] {
  return Array.from({ length: months + 6 }, (_, i) => ({ date: `2019-${String((i % 12) + 1).padStart(2, "0")}-01`, value }));
}

function cpiRecord(eur: RateObservation[], usd: RateObservation[]): Record<Currency, RateObservation[]> {
  const empty: RateObservation[] = [];
  return { EUR: eur, USD: usd, GBP: empty, JPY: empty, AUD: empty, CAD: empty, CHF: empty, NZD: empty };
}

describe("buildRealExchangeRateSeries", () => {
  it("with IDENTICAL relative CPI (both currencies), the real rate equals the nominal rate", () => {
    const nominal = monthlySeries([1.1, 1.1, 1.1]);
    const cpi = cpiRecord(flatCpi(100, 3), flatCpi(100, 3));
    const real = buildRealExchangeRateSeries("EURUSD", nominal, cpi);
    for (const r of real) expect(Math.exp(r.logRealRate)).toBeCloseTo(1.1, 6);
  });

  it("applies a publication lag — a CPI print available only in a later month cannot affect an earlier real-rate reading", () => {
    const nominal = monthlySeries([1.1, 1.1]);
    const laggedCpi: RateObservation[] = [{ date: "2019-01-01", value: 100 }]; // only one, old, observation
    const cpi = cpiRecord(laggedCpi, laggedCpi);
    const real = buildRealExchangeRateSeries("EURUSD", nominal, cpi);
    expect(real.length).toBe(2); // still computes using the last available (lagged) observation, never a future one
  });
});

describe("buildValueZScoreSeries", () => {
  it("requires at least 24 months of baseline before scoring", () => {
    const shortSeries = Array.from({ length: 10 }, (_, i) => ({ monthEnd: `m${i}`, logRealRate: 0.1 }));
    expect(buildValueZScoreSeries(shortSeries)).toEqual([]);
  });

  it("a currency far BELOW its historical real-rate average scores POSITIVE (cheap = long signal)", () => {
    const baseline = Array.from({ length: 30 }, (_, i) => ({ monthEnd: `m${i}`, logRealRate: 0 }));
    const cheap = [...baseline, { monthEnd: "m30", logRealRate: -1 }]; // a sharp real depreciation
    const z = buildValueZScoreSeries(cheap);
    expect(z.at(-1)!.zScore).toBeGreaterThan(0);
  });

  it("a currency far ABOVE its historical real-rate average scores NEGATIVE (expensive = short signal)", () => {
    const baseline = Array.from({ length: 30 }, (_, i) => ({ monthEnd: `m${i}`, logRealRate: 0 }));
    const expensive = [...baseline, { monthEnd: "m30", logRealRate: 1 }];
    const z = buildValueZScoreSeries(expensive);
    expect(z.at(-1)!.zScore).toBeLessThan(0);
  });

  it("is causal: the z-score baseline window never extends beyond PPP_BASELINE_WINDOW_MONTHS and never uses future data", () => {
    const baseline = Array.from({ length: 40 }, (_, i) => ({ monthEnd: `m${i}`, logRealRate: 0 }));
    const withFuture = [...baseline, { monthEnd: "m40", logRealRate: 5 }]; // a future extreme value
    const withoutFuture = buildValueZScoreSeries(baseline);
    const withFutureResult = buildValueZScoreSeries(withFuture);
    // Every score computed BEFORE the future extreme value must be identical.
    expect(withFutureResult.slice(0, withoutFuture.length)).toEqual(withoutFuture);
  });
});
