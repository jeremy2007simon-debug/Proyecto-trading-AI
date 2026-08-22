/**
 * Block 8.3 — consolidates parameter-robustness and correlation-vs-RS3M
 * summaries across all 30 experiments into the dedicated
 * `results/block8-3/{parameter-robustness,correlation}/` directories
 * (§32 of the brief's required file layout). Pure aggregation over the
 * already-computed `results/block8-3/experiments/*.json` — never
 * recomputes a backtest.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/us-index/run-block8-3-summaries.ts
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EXPERIMENTS_DIR = join(process.cwd(), "results", "block8-3", "experiments");
const PARAM_ROBUSTNESS_DIR = join(process.cwd(), "results", "block8-3", "parameter-robustness");
const CORRELATION_DIR = join(process.cwd(), "results", "block8-3", "correlation");

function loadAll(): Record<string, unknown>[] {
  return readdirSync(EXPERIMENTS_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => JSON.parse(readFileSync(join(EXPERIMENTS_DIR, f), "utf8")));
}

function main(): void {
  mkdirSync(PARAM_ROBUSTNESS_DIR, { recursive: true });
  mkdirSync(CORRELATION_DIR, { recursive: true });
  const all = loadAll();

  const byFamily = new Map<string, Record<string, unknown>[]>();
  for (const exp of all) {
    const family = exp.family as string;
    const list = byFamily.get(family) ?? [];
    list.push(exp);
    byFamily.set(family, list);
  }

  const paramRobustness: Record<string, unknown> = {};
  for (const [family, exps] of byFamily) {
    paramRobustness[family] = exps.map((e) => {
      const costScenarios = e.costScenarios as { REALISTIC?: { sharpeRatio?: number } } | undefined;
      return {
        id: e.experimentId,
        parameters: e.parameters,
        classification: e.classification,
        realisticSharpe: costScenarios?.REALISTIC?.sharpeRatio ?? null,
        deflatedSharpeRatio: e.deflatedSharpeRatio ?? null,
      };
    });
  }
  writeFileSync(join(PARAM_ROBUSTNESS_DIR, "by-family.json"), JSON.stringify(paramRobustness, null, 2));

  const correlation = all.map((e) => ({ id: e.experimentId, family: e.family, correlationVsRs3m: e.correlationVsRs3m ?? null }));
  writeFileSync(join(CORRELATION_DIR, "vs-rs3m.json"), JSON.stringify(correlation, null, 2));

  console.log(`[Block 8.3] Wrote parameter-robustness/by-family.json (${Object.keys(paramRobustness).length} families) and correlation/vs-rs3m.json (${correlation.length} experiments).`);
}

main();
