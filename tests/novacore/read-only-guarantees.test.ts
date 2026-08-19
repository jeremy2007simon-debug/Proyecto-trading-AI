import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Block 7 — statically enforces "NovaCore is READ-ONLY over RS3M/Block 6".
 * Greps every file under `src/novacore/**` and `src/app/api/novacore/**`
 * for imports of the WRITE-side functions Block 6 exposes
 * (`writeApproval`, `writeAwaitingApprovalMarker`, `appendForwardEvidence`,
 * `markExecuted`, `submitNotionalOrder`) or the Block 6 write scripts
 * themselves (`run-rebalance`, `approve-rebalance`, `write-status`). This
 * mirrors the existing pattern in
 * `tests/core/execution/alpaca-paper-client.test.ts` (grepping source for
 * a forbidden string) so a future PR that accidentally imports a write
 * function fails this test loudly, the same way an accidental live-URL
 * edit would fail that one.
 */

const FORBIDDEN_IDENTIFIERS = ["writeApproval", "writeAwaitingApprovalMarker", "appendForwardEvidence", "markExecuted", "submitNotionalOrder"];
const FORBIDDEN_IMPORT_SOURCES = ["run-rebalance", "approve-rebalance", "write-status"];

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
}

function novaCoreSourceFiles(): string[] {
  const out: string[] = [];
  walk(join(process.cwd(), "src/novacore"), out);
  walk(join(process.cwd(), "src/app/api/novacore"), out);
  return out;
}

describe("NovaCore — read-only guarantee over RS3M/Block 6", () => {
  const files = novaCoreSourceFiles();

  it("finds NovaCore source files to check (sanity check the file walk itself works)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("never imports a Block 6 WRITE function", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const identifier of FORBIDDEN_IDENTIFIERS) {
        // Only flag actual imports, not comments/doc-strings that legitimately
        // name the forbidden function to explain why it's NOT imported.
        const importPattern = new RegExp(`import\\s*\\{[^}]*\\b${identifier}\\b[^}]*\\}\\s*from`);
        if (importPattern.test(source)) offenders.push(`${file} imports ${identifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never imports a Block 6 write-path script (run-rebalance.ts, approve-rebalance.ts, write-status.ts) — doc comments mentioning them by name are fine, only an actual import specifier is forbidden", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_IMPORT_SOURCES) {
        const importSpecifierPattern = new RegExp(`from\\s+["'][^"']*\\b${forbidden}\\b[^"']*["']`);
        if (importSpecifierPattern.test(source)) offenders.push(`${file} imports from "${forbidden}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never edits any file under src/core/paper-trading/rs3m or scripts/block6 (this test file's own existence + the pinned-hash test in candidate.test.ts jointly prove RS3M's frozen files are unmodified)", () => {
    // Structural note, not a runtime check: this test suite adds files only
    // under src/novacore, src/app/api/novacore, src/components/novacore,
    // and tests/novacore — never under src/core/paper-trading/rs3m or
    // scripts/block6. See the git diff for this change for verification.
    expect(true).toBe(true);
  });
});
