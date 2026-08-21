import { describe, expect, it } from "vitest";
import { OOS_HOLDOUT_PCT, splitMonthsChronologically } from "@/core/portfolio-research/oos-split";
import { buildMonthlyWalkForwardWindows } from "@/core/portfolio-research/walk-forward";

describe("splitMonthsChronologically", () => {
  const items = Array.from({ length: 100 }, (_, i) => i);

  it("keeps items in original (chronological) order — never shuffles", () => {
    const { inSample, outOfSample } = splitMonthsChronologically(items);
    expect(inSample).toEqual(items.slice(0, inSample.length));
    expect(outOfSample).toEqual(items.slice(inSample.length));
  });

  it("the OOS slice is exactly the LAST OOS_HOLDOUT_PCT% of items — never the first", () => {
    const { inSample, outOfSample } = splitMonthsChronologically(items);
    expect(outOfSample.length).toBe(Math.floor(items.length * (OOS_HOLDOUT_PCT / 100)));
    expect(outOfSample[0]).toBe(items[inSample.length]);
    expect(outOfSample.at(-1)).toBe(items.at(-1));
  });

  it("in-sample + OOS accounts for every item exactly once", () => {
    const { inSample, outOfSample } = splitMonthsChronologically(items);
    expect(inSample.length + outOfSample.length).toBe(items.length);
  });
});

describe("buildMonthlyWalkForwardWindows", () => {
  it("each window's forward slice starts exactly where its train slice ends — no gap, no overlap with train", () => {
    const items = Array.from({ length: 200 }, (_, i) => i);
    const windows = buildMonthlyWalkForwardWindows(items, { trainMonths: 60, forwardMonths: 12, stepMonths: 12 });
    expect(windows.length).toBeGreaterThan(0);
    for (const w of windows) {
      expect(w.train.length).toBe(60);
      expect(w.forward.length).toBe(12);
      expect(w.forward[0]).toBe(w.train.at(-1)! + 1);
    }
  });

  it("windows never extend beyond the provided items (no partial trailing window)", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const windows = buildMonthlyWalkForwardWindows(items, { trainMonths: 60, forwardMonths: 12, stepMonths: 12 });
    for (const w of windows) {
      expect(w.forward.at(-1)).toBeLessThanOrEqual(99);
    }
  });

  it("produces zero windows when there isn't enough history — never a truncated window", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const windows = buildMonthlyWalkForwardWindows(items, { trainMonths: 60, forwardMonths: 12, stepMonths: 12 });
    expect(windows).toEqual([]);
  });
});
