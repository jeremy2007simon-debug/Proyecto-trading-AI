import { describe, expect, it } from "vitest";
import { carryDifferentialMonthly } from "@/core/portfolio-research/carry";
import { latestObservationAsOf } from "@/core/portfolio-research/data-loaders";
import type { Currency, RateObservation } from "@/core/portfolio-research/types";

describe("latestObservationAsOf — causal lookup", () => {
  const series: RateObservation[] = [
    { date: "2020-01-01", value: 1 },
    { date: "2020-02-01", value: 2 },
    { date: "2020-03-01", value: 3 },
  ];

  it("returns the latest observation on or before the query date", () => {
    expect(latestObservationAsOf(series, "2020-02-15")?.value).toBe(2);
    expect(latestObservationAsOf(series, "2020-02-01")?.value).toBe(2);
  });

  it("never returns an observation dated AFTER the query date", () => {
    expect(latestObservationAsOf(series, "2020-01-15")?.value).toBe(1);
  });

  it("returns undefined when the query date is before every observation", () => {
    expect(latestObservationAsOf(series, "2019-12-31")).toBeUndefined();
  });
});

describe("carryDifferentialMonthly", () => {
  const empty: RateObservation[] = [];
  const rates: Record<Currency, RateObservation[]> = {
    USD: [{ date: "2020-01-01", value: 1.0 }],
    AUD: [{ date: "2020-01-01", value: 4.0 }],
    EUR: empty,
    GBP: empty,
    JPY: empty,
    CAD: empty,
    CHF: empty,
    NZD: empty,
  };

  it("is (longRate - shortRate) / 100 / 12 — annualized-% differential scaled to monthly", () => {
    const diff = carryDifferentialMonthly(rates, "AUD", "USD", "2020-06-01");
    expect(diff).toBeCloseTo((4.0 - 1.0) / 100 / 12, 10);
  });

  it("is antisymmetric: swapping long/short currencies negates the differential", () => {
    const a = carryDifferentialMonthly(rates, "AUD", "USD", "2020-06-01")!;
    const b = carryDifferentialMonthly(rates, "USD", "AUD", "2020-06-01")!;
    expect(a).toBeCloseTo(-b, 10);
  });
});
