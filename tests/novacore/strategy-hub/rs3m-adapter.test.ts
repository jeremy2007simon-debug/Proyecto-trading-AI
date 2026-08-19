import { describe, expect, it } from "vitest";
import { EXPECTED_RS3M_CANDIDATE_V1_HASH } from "@/core/paper-trading/rs3m/safety-guards";
import { getRs3mStrategy } from "@/novacore/strategy-hub/adapters/rs3m-adapter";
import { getNovaCoreStrategyById, listNovaCoreStrategies } from "@/novacore/strategy-hub/registry";

describe("NovaCore Strategy Hub — RS3M read-only adapter", () => {
  it("surfaces the exact pinned candidate hash — never a NovaCore-invented value", () => {
    const { strategy, candidateHashVerified } = getRs3mStrategy();
    expect(strategy.candidateHash).toBe(EXPECTED_RS3M_CANDIDATE_V1_HASH);
    expect(candidateHashVerified).toBe(true);
  });

  it("registers RS3M_CANDIDATE_V1 as the Strategy Hub's first (and, in this block, only) entry", () => {
    const strategies = listNovaCoreStrategies();
    expect(strategies).toHaveLength(1);
    expect(strategies[0].id).toBe("RS3M_CANDIDATE_V1");
  });

  it("getNovaCoreStrategyById resolves the RS3M entry and returns undefined for anything else", () => {
    expect(getNovaCoreStrategyById("RS3M_CANDIDATE_V1")?.id).toBe("RS3M_CANDIDATE_V1");
    expect(getNovaCoreStrategyById("SOMETHING_ELSE")).toBeUndefined();
  });

  it("never fabricates forward evidence — 0 months observed and 0 orders when the ledger is empty (true in this environment)", () => {
    const { forwardEvidence } = getRs3mStrategy();
    expect(forwardEvidence.monthsObserved).toBe(0);
    expect(forwardEvidence.totalOrdersSubmitted).toBe(0);
    expect(forwardEvidence.lastKnownWinner).toBeUndefined();
  });

  it("always populates sourceOfTruth for every strategy — never a blank attribution", () => {
    const { strategy } = getRs3mStrategy();
    expect(Object.keys(strategy.sourceOfTruth).length).toBeGreaterThan(0);
    for (const source of Object.values(strategy.sourceOfTruth)) {
      expect(source.length).toBeGreaterThan(0);
    }
  });

  it("falls back to the documented status (PAPER_READY) when no live status file exists, and says so honestly", () => {
    const { strategy, liveStatusAvailable } = getRs3mStrategy();
    if (!liveStatusAvailable) {
      expect(strategy.status).toBe("PAPER_READY");
      expect(strategy.sourceOfTruth.status).toContain("doc fallback");
    }
  });
});
