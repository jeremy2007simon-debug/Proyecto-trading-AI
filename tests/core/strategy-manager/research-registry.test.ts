import { describe, expect, it } from "vitest";
import { getDefaultStrategyManager } from "@/core/strategy-manager/registry";
import { getResearchStrategyManager } from "@/core/strategy-manager/research-registry";

const LEGACY_IDS = ["trend-following", "breakout", "vwap", "mean-reversion", "opening-range-breakout"];
const NEW_RESEARCH_IDS = [
  "momentum-trend",
  "trend-pullback",
  "volatility-compression-breakout",
  "gap-continuation",
  "session-momentum",
  "volatility-regime-momentum",
  "pairs-spread-reversion",
];

describe("getResearchStrategyManager", () => {
  it("registers all 5 legacy strategies plus all 7 new Block 5 research strategies", () => {
    const manager = getResearchStrategyManager();
    const ids = manager.listRegistrations().map((r) => r.strategy.id);

    for (const id of [...LEGACY_IDS, ...NEW_RESEARCH_IDS]) {
      expect(ids).toContain(id);
    }
    expect(ids).toHaveLength(LEGACY_IDS.length + NEW_RESEARCH_IDS.length);
  });

  it("has no duplicate strategy ids", () => {
    const ids = getResearchStrategyManager()
      .listRegistrations()
      .map((r) => r.strategy.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is a singleton across calls", () => {
    expect(getResearchStrategyManager()).toBe(getResearchStrategyManager());
  });

  it("every registered strategy declares Block 5 research metadata (family/status/hypothesis)", () => {
    const manager = getResearchStrategyManager();
    for (const registration of manager.listRegistrations()) {
      expect(registration.strategy.family, `${registration.strategy.id} is missing family`).toBeDefined();
      expect(registration.strategy.status, `${registration.strategy.id} is missing status`).toBeDefined();
      expect(registration.strategy.hypothesis, `${registration.strategy.id} is missing hypothesis`).toBeDefined();
    }
  });
});

describe("getDefaultStrategyManager — production registry is unaffected by Block 5", () => {
  it("still contains exactly the 5 original strategies", () => {
    const ids = getDefaultStrategyManager()
      .listRegistrations()
      .map((r) => r.strategy.id)
      .sort();
    expect(ids).toEqual([...LEGACY_IDS].sort());
  });

  it("contains none of the new Block 5 research strategies", () => {
    const ids = getDefaultStrategyManager()
      .listRegistrations()
      .map((r) => r.strategy.id);
    for (const id of NEW_RESEARCH_IDS) {
      expect(ids).not.toContain(id);
    }
  });
});
