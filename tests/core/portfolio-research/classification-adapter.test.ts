import { describe, expect, it } from "vitest";
import { monthlySampleQuality } from "@/core/portfolio-research/classification-adapter";

describe("monthlySampleQuality", () => {
  it("classifies by years of history, not raw month count alone", () => {
    expect(monthlySampleQuality(12)).toBe("INSUFFICIENT"); // 1 year
    expect(monthlySampleQuality(35)).toBe("INSUFFICIENT"); // just under 3 years
    expect(monthlySampleQuality(36)).toBe("LOW"); // exactly 3 years
    expect(monthlySampleQuality(71)).toBe("LOW"); // just under 6 years
    expect(monthlySampleQuality(72)).toBe("MEDIUM"); // exactly 6 years
    expect(monthlySampleQuality(119)).toBe("MEDIUM"); // just under 10 years
    expect(monthlySampleQuality(120)).toBe("HIGH"); // exactly 10 years
    expect(monthlySampleQuality(180)).toBe("HIGH"); // this research's own 15-year dataset
  });
});
