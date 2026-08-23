import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Block 10 §6/§25/§27 — STATIC proof that no file under `src/core/
 * ca-shadow/` or `scripts/block10/ca-shadow/` (the entire shadow-engine
 * pipeline, including its I/O layer) references the ONLY module in this
 * codebase capable of submitting a real/paper order
 * (`@/core/execution/alpaca-paper-client`), nor calls its exported order-
 * submission surface by name. A shadow system that merely "doesn't call"
 * the order function today is one refactor away from being wired up by
 * accident; a shadow system whose source text CANNOT reference the broker
 * write path at all is structurally safer — this test is the tripwire
 * that keeps it that way.
 */

const FORBIDDEN_SUBSTRINGS = ["alpaca-paper-client", "createAlpacaPaperTradingClient", "submitNotionalOrder", "AlpacaPaperTradingClient", "AlpacaPaperTradingCredentials"];

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...collectFiles(full));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) files.push(full);
  }
  return files;
}

/**
 * Strips `//` and `/* *\/` comments before scanning — several files in
 * this pipeline deliberately DOCUMENT, in prose, that they avoid the
 * broker-write path by name (e.g. "this file imports NOTHING from
 * `@/core/execution/alpaca-paper-client`"), which is exactly the kind of
 * explanatory comment this codebase's own conventions want kept. Only
 * live CODE referencing the forbidden module is a real violation.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const SCANNED_DIRS = [join(process.cwd(), "src", "core", "ca-shadow"), join(process.cwd(), "scripts", "block10", "ca-shadow")];

describe("Block 10 §6/§25 — CA shadow pipeline never references the broker write path (static)", () => {
  const files = SCANNED_DIRS.flatMap((dir) => collectFiles(dir));
  const codeByFile = new Map(files.map((f) => [f, stripComments(readFileSync(f, "utf8"))]));

  it("scans at least the known shadow-engine source files (sanity check that the scan isn't vacuous)", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(files.some((f) => f.endsWith("shadow-engine.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("evidence-store.ts"))).toBe(true);
  });

  it.each(FORBIDDEN_SUBSTRINGS)("no shadow-pipeline file's live code mentions forbidden broker-write symbol %s", (forbidden) => {
    const offenders = files.filter((f) => codeByFile.get(f)!.includes(forbidden));
    expect(offenders).toEqual([]);
  });

  it("no shadow-pipeline file's live code imports from @/core/execution/* at all", () => {
    const offenders = files.filter((f) => codeByFile.get(f)!.includes("@/core/execution/"));
    expect(offenders).toEqual([]);
  });
});
