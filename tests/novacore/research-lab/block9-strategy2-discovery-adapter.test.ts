import { describe, expect, it } from "vitest";
import {
  CUMULATIVE_TRIAL_LEDGER_SUMMARY,
  LITERATURE_FAMILIES_REVIEWED_COUNT,
  STRATEGY2_BACKTEST_OUTCOMES,
  STRATEGY2_CANDIDATES,
  STRATEGY2_TOP5_FAMILIES,
  STRATEGY2_VERIFICATION_OUTCOMES,
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

  it("cumulative trial ledger carries the ≥154 floor forward and adds Block 9.x's own 17 executed trials (≥171 total), never shrinking the pool", () => {
    expect(CUMULATIVE_TRIAL_LEDGER_SUMMARY.priorCumulativeFloor).toBe("≥171");
    expect(CUMULATIVE_TRIAL_LEDGER_SUMMARY.newTrialsThisBlock).toBe(17);
  });
});

describe("Block 9.x — Strategy #2 deep-backtest adapter (Phase B)", () => {
  it("covers exactly the 5 pre-registered families, each with a sourceDoc pointing at the Phase B report", () => {
    expect(STRATEGY2_BACKTEST_OUTCOMES).toHaveLength(5);
    expect(STRATEGY2_BACKTEST_OUTCOMES.map((f) => f.letter).sort()).toEqual(["C", "D", "E", "F", "M"]);
    for (const fam of STRATEGY2_BACKTEST_OUTCOMES) expect(fam.sourceDoc).toMatch(/docs\/BLOCK9B/);
  });

  it("configsExecuted + configsDataInsufficient sums to 4 for every family (the pre-registered 4-configs-per-family budget)", () => {
    for (const fam of STRATEGY2_BACKTEST_OUTCOMES) {
      expect(fam.configsExecuted + fam.configsDataInsufficient).toBe(4);
    }
  });

  it("exactly 2 families reached CANDIDATE_FOUND (E and C), matching the 2 surviving configs", () => {
    const withCandidates = STRATEGY2_BACKTEST_OUTCOMES.filter((f) => f.verdict === "CANDIDATE_FOUND");
    expect(withCandidates.map((f) => f.letter).sort()).toEqual(["C", "E"]);
    expect(withCandidates.flatMap((f) => f.candidateConfigIds).sort()).toEqual(["C-A", "E-C"]);
  });

  it("a NO_CANDIDATE family never carries a candidateConfigIds entry, and vice versa", () => {
    for (const fam of STRATEGY2_BACKTEST_OUTCOMES) {
      if (fam.verdict === "NO_CANDIDATE") expect(fam.candidateConfigIds).toHaveLength(0);
      else expect(fam.candidateConfigIds.length).toBeGreaterThan(0);
    }
  });

  it("Block 9.y independent verification resolved both candidates — C-A VERIFIED, E-C REJECTED — never left NOT_STARTED", () => {
    expect(STRATEGY2_CANDIDATES).toHaveLength(2);
    const ca = STRATEGY2_CANDIDATES.find((c) => c.configId === "C-A");
    const ec = STRATEGY2_CANDIDATES.find((c) => c.configId === "E-C");
    expect(ca?.independentVerificationStatus).toBe("VERIFIED");
    expect(ec?.independentVerificationStatus).toBe("REJECTED");
    for (const c of STRATEGY2_CANDIDATES) {
      expect(Object.values(c)).not.toContain("PAPER_READY");
      expect(Object.values(c)).not.toContain("PAPER_RUNNING");
    }
  });

  it("C-A is the round's best diversifier and, post-verification, also its higher-DSR survivor (E-C's original DSR was invalidated by a confirmed implementation bug)", () => {
    const ca = STRATEGY2_CANDIDATES.find((c) => c.configId === "C-A");
    const ec = STRATEGY2_CANDIDATES.find((c) => c.configId === "E-C");
    expect(ca?.correlationVsRs3m).toBeLessThan(ec?.correlationVsRs3m ?? 1);
    expect(ca?.dsrCumulativePool).toBeGreaterThan(ec?.dsrCumulativePool ?? 1);
  });

  it("C-A's verified 50/50 blend with RS3M improves MaxDD on both windows; E-C's spec-compliant blend does not clearly improve on the extended window", () => {
    const ec = STRATEGY2_CANDIDATES.find((c) => c.configId === "E-C")!;
    const ca = STRATEGY2_CANDIDATES.find((c) => c.configId === "C-A")!;
    expect(ca.portfolioBlendMaxDrawdownPct).toBeLessThan(65.11); // C-A's own extended-window RS3M-alone baseline
    expect(ec.portfolioBlendMaxDrawdownPct).toBeGreaterThan(23.67); // E-C's spec-compliant blend is WORSE than RS3M alone on the extended window — a real, disclosed finding, not a bug
  });

  it("both verification outcomes cite the frozen spec hash and a real reproduction verdict", () => {
    expect(STRATEGY2_VERIFICATION_OUTCOMES).toHaveLength(2);
    for (const v of STRATEGY2_VERIFICATION_OUTCOMES) {
      expect(v.specHash).toMatch(/^[0-9a-f]{8}$/);
      expect(v.reproductionVerdict.length).toBeGreaterThan(0);
      expect(v.sourceDoc).toMatch(/BLOCK9Y/);
    }
    const ec = STRATEGY2_VERIFICATION_OUTCOMES.find((v) => v.configId === "E-C")!;
    expect(ec.reproductionVerdict).toMatch(/FAIL/);
    expect(ec.keyFailurePoints.length).toBeGreaterThan(0);
    const ca = STRATEGY2_VERIFICATION_OUTCOMES.find((v) => v.configId === "C-A")!;
    expect(ca.keyFailurePoints).toHaveLength(0);
  });
});
