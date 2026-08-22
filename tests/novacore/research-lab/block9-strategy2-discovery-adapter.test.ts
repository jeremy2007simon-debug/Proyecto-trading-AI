import { describe, expect, it } from "vitest";
import {
  CUMULATIVE_TRIAL_LEDGER_SUMMARY,
  LITERATURE_FAMILIES_REVIEWED_COUNT,
  STRATEGY2_TOP5_FAMILIES,
  getStrategy2FamilyByRank,
} from "@/novacore/research-lab/adapters/block9-strategy2-discovery-adapter";

describe("Block 9 — Strategy #2 Discovery adapter", () => {
  it("lists exactly 5 Top-5 families, ranked 1-5 with no gaps or duplicates", () => {
    expect(STRATEGY2_TOP5_FAMILIES).toHaveLength(5);
    expect(STRATEGY2_TOP5_FAMILIES.map((f) => f.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("rank 1 holds the highest additive score (the ranking is score-led, though not a strict score sort below #1 — see the discovery report's disclosed qualitative tie-breakers)", () => {
    const rank1 = getStrategy2FamilyByRank(1);
    const maxScore = Math.max(...STRATEGY2_TOP5_FAMILIES.map((f) => f.score));
    expect(rank1?.score).toBe(maxScore);
  });

  it("reviewed 20 literature families (A-T) before selecting the Top-5", () => {
    expect(LITERATURE_FAMILIES_REVIEWED_COUNT).toBe(20);
  });

  it("no family is wired to Alpaca execution beyond documentation — every family cites a sourceDoc, none carries a PAPER_READY/PAPER_RUNNING status", () => {
    for (const fam of STRATEGY2_TOP5_FAMILIES) {
      expect(fam.sourceDoc).toMatch(/docs\/BLOCK9/);
      expect(Object.values(fam)).not.toContain("PAPER_READY");
      expect(Object.values(fam)).not.toContain("PAPER_RUNNING");
    }
  });

  it("every family has a real evidence grade (A-D) and a disclosed main falsification risk", () => {
    for (const fam of STRATEGY2_TOP5_FAMILIES) {
      expect(["A", "B", "C", "D"]).toContain(fam.evidenceGrade);
      expect(fam.mainFalsificationRisk.length).toBeGreaterThan(0);
    }
  });

  it("getStrategy2FamilyByRank returns the matching family and undefined for an unknown rank", () => {
    expect(getStrategy2FamilyByRank(1)?.letter).toBe("D");
    expect(getStrategy2FamilyByRank(99)).toBeUndefined();
  });

  it("cumulative trial ledger carries the Block 8.4 floor forward unchanged, with 0 new backtests this block", () => {
    expect(CUMULATIVE_TRIAL_LEDGER_SUMMARY.priorCumulativeFloor).toBe("≥154");
    expect(CUMULATIVE_TRIAL_LEDGER_SUMMARY.newTrialsThisBlock).toBe(0);
    expect(CUMULATIVE_TRIAL_LEDGER_SUMMARY.sourceDoc).toMatch(/results\/block9\//);
  });
});
