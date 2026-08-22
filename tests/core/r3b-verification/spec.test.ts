import { describe, expect, it } from "vitest";
import { R3B_FROZEN_SPEC, computeR3bSpecHash } from "@/core/r3b-verification/spec";

/**
 * Block 8.4 §2 — pins the frozen R3-B spec's hash, same convention as
 * RS3M_CANDIDATE_V1's own pinned-hash test. If this fails, someone
 * edited the spec transcription after the fact — not allowed per this
 * block's own "No cambies la lógica después" rule.
 */
describe("R3B_FROZEN_SPEC — freeze", () => {
  it("matches its pinned hash (fails loudly on any edit)", () => {
    expect(computeR3bSpecHash(R3B_FROZEN_SPEC)).toBe("9c1f213e");
  });

  it("declares the exact parameters extracted from Block 8.3's original implementation", () => {
    expect(R3B_FROZEN_SPEC.smaTrendPeriod).toBe(50);
    expect(R3B_FROZEN_SPEC.regimeLongTermTrendSmaPeriod).toBe(200);
    expect(R3B_FROZEN_SPEC.rsiPeriod).toBe(14);
    expect(R3B_FROZEN_SPEC.entryRsiThreshold).toBe(40);
    expect(R3B_FROZEN_SPEC.exitRsiThreshold).toBe(55);
    expect(R3B_FROZEN_SPEC.maxHoldDays).toBe(20);
    expect(R3B_FROZEN_SPEC.regimeFilterMode).toBe("LONG_TERM_TREND");
    expect(R3B_FROZEN_SPEC.market).toBe("SPY");
  });

  it("is deeply frozen — cannot be mutated at runtime", () => {
    expect(Object.isFrozen(R3B_FROZEN_SPEC)).toBe(true);
    expect(() => {
      // @ts-expect-error — readonly at the type level too; testing the RUNTIME guarantee.
      R3B_FROZEN_SPEC.entryRsiThreshold = 30;
    }).toThrow();
  });

  it("hash changes if any single field changes (proving the hash would catch a silent edit)", () => {
    const mutated = { ...R3B_FROZEN_SPEC, entryRsiThreshold: 30 };
    expect(computeR3bSpecHash(mutated)).not.toBe(computeR3bSpecHash(R3B_FROZEN_SPEC));
  });
});
