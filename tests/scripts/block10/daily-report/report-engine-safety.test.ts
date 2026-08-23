import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Block 10.1 §3/§20/§26/§27/§28/§31 — static safety proofs for the Daily
 * Close Report engine specifically (RS3M's own guarantees are covered by
 * `tests/core/ca-shadow/rs3m-isolation.test.ts`; C-A's shadow pipeline by
 * `tests/core/ca-shadow/no-broker-writes.test.ts`). The report engine
 * reads BOTH strategies, so it needs its own tripwire: it must never
 * import an order-submission or approval-WRITE function from either.
 */

const FORBIDDEN_SUBSTRINGS = [
  "alpaca-paper-client",
  "createAlpacaPaperTradingClient",
  "submitNotionalOrder",
  "writeApproval",
  "writeAwaitingApprovalMarker",
  "markExecuted",
  "appendForwardEvidence", // RS3M's OWN ledger writer — the report only ever READS readForwardEvidenceLedger
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...collectFiles(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) files.push(full);
  }
  return files;
}

const SCANNED_DIRS = [join(process.cwd(), "src", "novacore", "reports"), join(process.cwd(), "scripts", "block10", "daily-report")];

describe("Block 10.1 — Daily Close Report engine never writes orders or approvals", () => {
  const files = SCANNED_DIRS.flatMap((dir) => collectFiles(dir));
  const codeByFile = new Map(files.map((f) => [f, stripComments(readFileSync(f, "utf8"))]));

  it("scans at least the known report-engine files (sanity check)", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(files.some((f) => f.endsWith("run-daily-close.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("aggregate-daily-close-report.ts"))).toBe(true);
  });

  it.each(FORBIDDEN_SUBSTRINGS)("no report-engine file's live code references forbidden write symbol %s", (forbidden) => {
    const offenders = files.filter((f) => codeByFile.get(f)!.includes(forbidden));
    expect(offenders).toEqual([]);
  });

  it("no report-engine file's live code imports from @/core/execution/* (order submission)", () => {
    const offenders = files.filter((f) => codeByFile.get(f)!.includes("@/core/execution/"));
    expect(offenders).toEqual([]);
  });

  it("no report-engine file writes to results/block6/** — RS3M's own state is read-only to this engine", () => {
    const offenders = files.filter((f) => {
      const code = codeByFile.get(f)!;
      // Reading via `readForwardEvidenceLedger`/`scripts/block6/paper/forward-evidence-store` (a READ-only export) is fine and expected;
      // only a literal write-path string (results/block6/forward, .../approval, .../executed.json) is a violation.
      return /results\/block6\/(forward\/.*approval|forward\/.*executed)/.test(code);
    });
    expect(offenders).toEqual([]);
  });

  it("the report engine's own equity-mark ledger lives under results/block10/daily-reports, never results/block6", async () => {
    const { readRs3mEquityMarks } = await import("../../../../scripts/block10/daily-report/rs3m-equity-marks");
    expect(typeof readRs3mEquityMarks).toBe("function");
    const source = readFileSync(join(process.cwd(), "scripts", "block10", "daily-report", "rs3m-equity-marks.ts"), "utf8");
    expect(source).toContain("results\", \"block10\", \"daily-reports\"");
    expect(stripComments(source)).not.toContain("results/block6");
  });
});
