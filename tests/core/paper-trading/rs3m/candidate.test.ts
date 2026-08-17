import { describe, expect, it } from "vitest";
import { computeCandidateHash, RS3M_CANDIDATE_V1, type FrozenCandidateDefinition } from "@/core/paper-trading/rs3m/candidate";

/**
 * PINNED hash — if this test fails, someone edited `RS3M_CANDIDATE_V1`'s
 * definition in place. That is exactly what the Block 6 spec forbids: any
 * intentional change to the candidate's parameters must ship as a NEW
 * export (`RS3M_CANDIDATE_V2`), never a mutation of V1. Do not "fix" this
 * test by updating the literal below unless you are deliberately
 * reverting an accidental edit back to the original frozen values.
 */
const RS3M_CANDIDATE_V1_EXPECTED_HASH = "1c28b57c";

describe("RS3M_CANDIDATE_V1 — freeze", () => {
  it("matches its pinned hash (fails loudly on any in-place edit)", () => {
    expect(computeCandidateHash(RS3M_CANDIDATE_V1)).toBe(RS3M_CANDIDATE_V1_EXPECTED_HASH);
  });

  it("declares the exact frozen parameters from the Block 5 candidate", () => {
    expect(RS3M_CANDIDATE_V1.candidateId).toBe("RS3M_CANDIDATE_V1");
    expect(RS3M_CANDIDATE_V1.version).toBe(1);
    expect(RS3M_CANDIDATE_V1.lookbackMonths).toBe(3);
    expect(RS3M_CANDIDATE_V1.universe).toEqual(["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"]);
    expect(RS3M_CANDIDATE_V1.rebalanceFrequency).toBe("MONTHLY");
    expect(RS3M_CANDIDATE_V1.weighting).toBe("SINGLE_WINNER_100PCT");
    expect(RS3M_CANDIDATE_V1.priceAdjustment).toBe("all");
  });

  it("is deeply frozen — cannot be mutated at runtime", () => {
    expect(Object.isFrozen(RS3M_CANDIDATE_V1)).toBe(true);
    expect(Object.isFrozen(RS3M_CANDIDATE_V1.universe)).toBe(true);

    expect(() => {
      // @ts-expect-error — readonly at the type level too; this is testing the RUNTIME guarantee.
      RS3M_CANDIDATE_V1.lookbackMonths = 6;
    }).toThrow();
  });

  it("hash is a pure, deterministic function of the definition (reproducible across calls)", () => {
    expect(computeCandidateHash(RS3M_CANDIDATE_V1)).toBe(computeCandidateHash(RS3M_CANDIDATE_V1));
  });

  it("hash changes if any single field changes (parameter isolation) — proving the hash would actually catch a silent edit", () => {
    const base = RS3M_CANDIDATE_V1;
    const mutated: FrozenCandidateDefinition = { ...base, lookbackMonths: 6 };
    expect(computeCandidateHash(mutated)).not.toBe(computeCandidateHash(base));
  });

  it("hash does NOT depend on anything outside the strategy definition (no gitCommit/frozenAt fields exist on this type)", () => {
    const keys = Object.keys(RS3M_CANDIDATE_V1);
    expect(keys).not.toContain("gitCommit");
    expect(keys).not.toContain("frozenAt");
  });
});
