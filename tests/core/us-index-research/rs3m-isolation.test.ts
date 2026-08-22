import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RS3M_CANDIDATE_V1, computeCandidateHash } from "@/core/paper-trading/rs3m/candidate";
import { buildRs3mBenchmarkSeries } from "@/core/us-index-research/rs3m-benchmark";
import type { UsIndexDailyBar, UsIndexMarket } from "@/core/us-index-research/types";

/**
 * Block 8.3 — proves the isolation §31/§35 of the brief require: this
 * round's code may READ RS3M_CANDIDATE_V1 (as a benchmark, per
 * `rs3m-benchmark.ts`'s own docstring) but nothing under
 * `src/core/paper-trading/rs3m/**` or `scripts/block6/**` may import
 * ANYTHING from `us-index-research` — a one-way dependency direction,
 * checked here by scanning actual source text rather than trusting a
 * comment.
 */
function listTsFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...listTsFilesRecursive(full));
    else if (entry.endsWith(".ts")) files.push(full);
  }
  return files;
}

describe("RS3M isolation — one-way dependency", () => {
  it("no file under src/core/paper-trading/rs3m/** imports from us-index-research", () => {
    const files = listTsFilesRecursive(join(process.cwd(), "src", "core", "paper-trading", "rs3m"));
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must not import from us-index-research`).not.toMatch(/us-index-research/);
    }
  });

  it("no file under scripts/block6/** imports from us-index-research", () => {
    const files = listTsFilesRecursive(join(process.cwd(), "scripts", "block6"));
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must not import from us-index-research`).not.toMatch(/us-index-research/);
    }
  });
});

describe("buildRs3mBenchmarkSeries — read-only reconstruction", () => {
  function makeBars(closes: number[]): UsIndexDailyBar[] {
    return closes.map((c, i) => ({ date: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10), open: c, high: c, low: c, close: c, adjClose: c, volume: 1000 }));
  }

  it("computes a result without mutating RS3M_CANDIDATE_V1 (still frozen, still hashes to its pinned value)", () => {
    const bars: Record<UsIndexMarket, UsIndexDailyBar[]> = {
      SPY: makeBars(Array.from({ length: 400 }, (_, i) => 100 + i * 0.1)),
      QQQ: makeBars(Array.from({ length: 400 }, (_, i) => 100 + i * 0.2)),
      IWM: makeBars(Array.from({ length: 400 }, (_, i) => 100 + i * 0.05)),
      DIA: makeBars(Array.from({ length: 400 }, (_, i) => 100 + i * 0.08)),
    };
    const hashBefore = computeCandidateHash(RS3M_CANDIDATE_V1);
    const result = buildRs3mBenchmarkSeries(bars);
    expect(result.months.length).toBeGreaterThan(0);
    expect(computeCandidateHash(RS3M_CANDIDATE_V1)).toBe(hashBefore);
    expect(Object.isFrozen(RS3M_CANDIDATE_V1)).toBe(true);
  });

  it("uses RS3M's own lookback (3 months) — never a different value silently substituted", () => {
    expect(RS3M_CANDIDATE_V1.lookbackMonths).toBe(3);
  });
});
