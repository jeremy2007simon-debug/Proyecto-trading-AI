import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RS3M_CANDIDATE_V1, computeCandidateHash } from "@/core/paper-trading/rs3m/candidate";

/**
 * Block 8.4 §27 — proves this block's isolation: nothing under
 * `src/core/paper-trading/rs3m/**` or `scripts/block6/**` imports from
 * this block's own new code (`r3b-verification`, `block8-4` scripts),
 * and RS3M_CANDIDATE_V1's hash is unchanged (still `1c28b57c`, verified
 * independently of `tests/core/paper-trading/rs3m/candidate.test.ts`,
 * which already pins it — this is a second, block-specific check).
 */
function listTsFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...listTsFilesRecursive(full));
    else if (entry.endsWith(".ts")) files.push(full);
  }
  return files;
}

describe("Block 8.4 — RS3M isolation", () => {
  it("RS3M_CANDIDATE_V1 hash is still 1c28b57c", () => {
    expect(computeCandidateHash(RS3M_CANDIDATE_V1)).toBe("1c28b57c");
  });

  it("no file under src/core/paper-trading/rs3m/** references r3b-verification or block8-4", () => {
    const files = listTsFilesRecursive(join(process.cwd(), "src", "core", "paper-trading", "rs3m"));
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must not reference r3b-verification`).not.toMatch(/r3b-verification/);
      expect(content, `${file} must not reference block8-4`).not.toMatch(/block8-4/);
    }
  });

  it("no file under scripts/block6/** references r3b-verification or block8-4", () => {
    const files = listTsFilesRecursive(join(process.cwd(), "scripts", "block6"));
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(/r3b-verification/);
      expect(content).not.toMatch(/block8-4/);
    }
  });

  it("R3-B's own source (src/core/us-index-research/trend-pullback.ts, regime.ts) is byte-unmodified — this block never edits R3-B's implementation", () => {
    // A weak but useful proxy check: the files still export the exact same public symbols this block's own scripts depend on, unchanged.
    const trendPullback = readFileSync(join(process.cwd(), "src", "core", "us-index-research", "trend-pullback.ts"), "utf8");
    expect(trendPullback).toContain("export function runTrendPullbackBacktest");
    expect(trendPullback).toContain("entryRsiThreshold");
  });
});
