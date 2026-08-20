import { describe, expect, it } from "vitest";
import { normalizeToBase100 } from "@/novacore/risk-analytics/normalize-curve";

describe("normalizeToBase100", () => {
  it("returns an empty array for an empty input", () => {
    expect(normalizeToBase100([])).toEqual([]);
  });

  it("sets the first point to exactly 100", () => {
    const result = normalizeToBase100([{ label: "a", value: 250 }, { label: "b", value: 300 }]);
    expect(result[0].value).toBe(100);
  });

  it("scales every other point proportionally to the first", () => {
    const result = normalizeToBase100([
      { label: "a", value: 200 },
      { label: "b", value: 220 },
      { label: "c", value: 180 },
    ]);
    const values = result.map((p) => p.value);
    expect(values).toHaveLength(3);
    values.forEach((value, i) => expect(value).toBeCloseTo([100, 110, 90][i], 9));
  });

  it("never divides by zero — a zero base returns a flat 100 series instead of NaN/Infinity", () => {
    const result = normalizeToBase100([{ label: "a", value: 0 }, { label: "b", value: 50 }]);
    expect(result.every((p) => Number.isFinite(p.value))).toBe(true);
    expect(result[0].value).toBe(100);
  });

  it("preserves labels and array length", () => {
    const input = [{ label: "2026-01", value: 100 }, { label: "2026-02", value: 105 }];
    const result = normalizeToBase100(input);
    expect(result.map((p) => p.label)).toEqual(["2026-01", "2026-02"]);
    expect(result).toHaveLength(input.length);
  });
});
