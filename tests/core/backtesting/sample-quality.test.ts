import { describe, expect, it } from "vitest";
import { classifySampleQuality } from "@/core/backtesting/sample-quality";

describe("classifySampleQuality", () => {
  it("INSUFFICIENT below 10", () => {
    expect(classifySampleQuality(0)).toBe("INSUFFICIENT");
    expect(classifySampleQuality(9)).toBe("INSUFFICIENT");
  });

  it("LOW from 10 to 29", () => {
    expect(classifySampleQuality(10)).toBe("LOW");
    expect(classifySampleQuality(29)).toBe("LOW");
  });

  it("MEDIUM from 30 to 99", () => {
    expect(classifySampleQuality(30)).toBe("MEDIUM");
    expect(classifySampleQuality(99)).toBe("MEDIUM");
  });

  it("HIGH from 100 up", () => {
    expect(classifySampleQuality(100)).toBe("HIGH");
    expect(classifySampleQuality(10_000)).toBe("HIGH");
  });
});
