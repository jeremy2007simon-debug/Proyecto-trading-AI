import { describe, expect, it } from "vitest";
import { seriesValueAtOffset } from "@/core/strategy-manager/series-lookup";

describe("seriesValueAtOffset", () => {
  const series = [10, 20, 30, 40, 50];

  it("offset 0 returns the last (current) value", () => {
    expect(seriesValueAtOffset(series, 0)).toBe(50);
  });

  it("offset N returns the value N entries before the current one", () => {
    expect(seriesValueAtOffset(series, 1)).toBe(40);
    expect(seriesValueAtOffset(series, 4)).toBe(10);
  });

  it("returns undefined instead of reading past the start of the series", () => {
    expect(seriesValueAtOffset(series, 5)).toBeUndefined();
    expect(seriesValueAtOffset(series, 100)).toBeUndefined();
  });

  it("never reads beyond the end of the series (no negative offsets accepted as future lookups)", () => {
    // offset is always subtracted from the last index; there is no way to
    // pass an offset that resolves to an index > series.length - 1.
    expect(seriesValueAtOffset(series, -1)).toBeUndefined();
  });
});
