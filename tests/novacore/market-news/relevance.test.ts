import { describe, expect, it } from "vitest";
import { buildWhyItMatters, classifyCategory, deriveRelatedMarkets, scoreRelevance } from "@/novacore/market-news/relevance";

describe("classifyCategory", () => {
  it("classifies a Fed headline as FED_RATES", () => {
    expect(classifyCategory("Fed holds interest rates steady, Powell signals caution")).toBe("FED_RATES");
  });

  it("classifies an inflation headline as INFLATION", () => {
    expect(classifyCategory("CPI inflation cools more than expected")).toBe("INFLATION");
  });

  it("falls back to GENERAL when nothing matches", () => {
    expect(classifyCategory("Local bakery wins regional pastry award")).toBe("GENERAL");
  });

  it("is deterministic — same input always produces the same category", () => {
    const headline = "Treasury yields spike after strong jobs report";
    expect(classifyCategory(headline)).toBe(classifyCategory(headline));
  });
});

describe("deriveRelatedMarkets", () => {
  it("maps known ETF symbols to their logical markets", () => {
    expect(deriveRelatedMarkets(["SPY", "QQQ"])).toEqual(expect.arrayContaining(["SP500", "NASDAQ100"]));
  });

  it("ignores unknown symbols rather than fabricating a market", () => {
    expect(deriveRelatedMarkets(["TSLA", "AAPL"])).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(deriveRelatedMarkets(["spy"])).toEqual(["SP500"]);
  });
});

describe("scoreRelevance", () => {
  it("scores 0-100", () => {
    const score = scoreRelevance("FED_RATES", ["SP500", "NASDAQ100"]);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("scores GENERAL lower than FED_RATES", () => {
    expect(scoreRelevance("GENERAL", [])).toBeLessThan(scoreRelevance("FED_RATES", []));
  });
});

describe("buildWhyItMatters", () => {
  it("returns undefined for GENERAL — never a generic filler sentence", () => {
    expect(buildWhyItMatters("GENERAL", [])).toBeUndefined();
  });

  it("never mentions buying, selling, or a trading action", () => {
    const explanation = buildWhyItMatters("FED_RATES", ["SP500"]);
    expect(explanation?.toLowerCase()).not.toMatch(/\b(buy|sell|order|trade)\b/);
  });

  it("is deterministic", () => {
    expect(buildWhyItMatters("INFLATION", ["SP500"])).toBe(buildWhyItMatters("INFLATION", ["SP500"]));
  });
});
