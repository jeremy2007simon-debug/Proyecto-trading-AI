import { describe, expect, it } from "vitest";
import { EXPECTED_CA_CANDIDATE_V1_HASH } from "@/core/ca-shadow/candidate";
import { getCaStrategy } from "@/novacore/strategy-hub/adapters/ca-adapter";
import { getNovaCoreStrategyById, listNovaCoreStrategies } from "@/novacore/strategy-hub/registry";

describe("NovaCore Strategy Hub — C-A shadow read-only adapter", () => {
  it("surfaces the exact pinned candidate hash — never a NovaCore-invented value", () => {
    const { strategy, candidateHashVerified } = getCaStrategy();
    expect(strategy.candidateHash).toBe(EXPECTED_CA_CANDIDATE_V1_HASH);
    expect(candidateHashVerified).toBe(true);
  });

  it("registers CA_CANDIDATE_V1 as the Strategy Hub's second entry, alongside RS3M", () => {
    const strategies = listNovaCoreStrategies();
    expect(strategies).toHaveLength(2);
    expect(strategies.map((s) => s.id)).toEqual(["RS3M_CANDIDATE_V1", "CA_CANDIDATE_V1"]);
  });

  it("getNovaCoreStrategyById resolves the C-A entry", () => {
    expect(getNovaCoreStrategyById("CA_CANDIDATE_V1")?.id).toBe("CA_CANDIDATE_V1");
  });

  it("environment is SHADOW, never PAPER/LIVE, and broker is never set — structurally never connected", () => {
    const { strategy } = getCaStrategy();
    expect(strategy.environment).toBe("SHADOW");
    expect(strategy.broker).toBeUndefined();
  });

  it("status is SHADOW_READY or SHADOW_RUNNING — NEVER PAPER_READY/PAPER/LIVE/VALIDATED (§31)", () => {
    const { strategy } = getCaStrategy();
    expect(["SHADOW_READY", "SHADOW_RUNNING"]).toContain(strategy.status);
  });

  it("defaults to SHADOW_READY with 0 forward evidence in a fresh environment (true in this environment — no shadow Routine has fired yet)", () => {
    const { strategy, shadowEvidence } = getCaStrategy();
    if (shadowEvidence.daysProcessed === 0) {
      expect(strategy.status).toBe("SHADOW_READY");
      expect(strategy.performance?.forward?.monthsObserved).toBe(0);
    }
  });

  it("always populates sourceOfTruth for every strategy — never a blank attribution, and explicitly says there is no broker account", () => {
    const { strategy } = getCaStrategy();
    expect(Object.keys(strategy.sourceOfTruth).length).toBeGreaterThan(0);
    for (const source of Object.values(strategy.sourceOfTruth)) {
      expect(source.length).toBeGreaterThan(0);
    }
    expect(strategy.sourceOfTruth["broker account/positions"]).toContain("NONE");
  });

  it("historical metrics are transcribed from the Block 9.y verification report, not recomputed", () => {
    const { strategy } = getCaStrategy();
    expect(strategy.performance?.historical?.totalReturnPct).toBe(253.3);
    expect(strategy.performance?.historical?.maxDrawdownPct).toBe(17.3);
    expect(strategy.performance?.historical?.sourceDoc).toContain("BLOCK9Y_INDEPENDENT_VERIFICATION_REPORT");
  });
});
