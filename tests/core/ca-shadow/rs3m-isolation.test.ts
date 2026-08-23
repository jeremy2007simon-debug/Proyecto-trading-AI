import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPECTED_RS3M_CANDIDATE_V1_HASH } from "@/core/paper-trading/rs3m/safety-guards";
import { computeCandidateHash, RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { EXPECTED_CA_CANDIDATE_V1_HASH, computeCaCandidateHash, CA_CANDIDATE_V1 } from "@/core/ca-shadow/candidate";

/**
 * Block 10 §1/§27 — proves Block 10's own work never touched RS3M.
 * "NO modificar RS3M. NO modificar Block 6. NO modificar RS3M Routine.
 * NO cambiar RS3M approval gate." This is the automated half of that
 * promise: RS3M's own pinned hash still matches its own frozen candidate
 * definition, is a completely different value from C-A's, and no file
 * under the C-A shadow pipeline writes to `results/block6/**` or imports
 * from `scripts/block6/paper/**` (RS3M's own paper-trading write path).
 */
describe("Block 10 — RS3M isolation", () => {
  it("RS3M_CANDIDATE_V1's hash is unchanged and still matches its own pinned tripwire", () => {
    expect(computeCandidateHash(RS3M_CANDIDATE_V1)).toBe(EXPECTED_RS3M_CANDIDATE_V1_HASH);
    expect(EXPECTED_RS3M_CANDIDATE_V1_HASH).toBe("1c28b57c");
  });

  it("CA_CANDIDATE_V1's hash is a completely different value from RS3M's — never accidentally aliased", () => {
    expect(computeCaCandidateHash(CA_CANDIDATE_V1)).toBe(EXPECTED_CA_CANDIDATE_V1_HASH);
    expect(EXPECTED_CA_CANDIDATE_V1_HASH).not.toBe(EXPECTED_RS3M_CANDIDATE_V1_HASH);
  });

  it("no C-A shadow pipeline file references RS3M's paper-trading write path or results/block6", () => {
    const dirs = [join(process.cwd(), "src", "core", "ca-shadow"), join(process.cwd(), "scripts", "block10", "ca-shadow")];
    const files: string[] = [];
    const collect = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) collect(full);
        else if (entry.endsWith(".ts")) files.push(full);
      }
    };
    dirs.forEach(collect);

    // Strip comments first — several files here deliberately DOCUMENT, in prose, that they mirror or
    // stay separate from RS3M's own paper-trading path (e.g. "mirrors results/block6/paper/forward-
    // evidence-store.ts's pattern") — that is explanatory text, not a live reference. Only an actual
    // import/path string in live code is a real isolation violation.
    const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const offenders = files.filter((f) => {
      const code = stripComments(readFileSync(f, "utf8"));
      return code.includes("scripts/block6/paper") || code.includes("results/block6") || code.includes("run-rebalance");
    });
    expect(offenders).toEqual([]);
  });
});
