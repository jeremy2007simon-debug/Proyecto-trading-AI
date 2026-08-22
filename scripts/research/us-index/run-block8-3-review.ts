/**
 * Block 8.3 — post-funnel REVIEW pass. The mechanical `classifyStrategy`
 * gate (reused unchanged from Block 5/8) does not check DSR, tail risk,
 * or correlation-vs-RS3M — exactly the gap Block 8.2 §10.1 documented
 * and overrode by hand for F3-E. This script applies the SAME kind of
 * override, but PROGRAMMATICALLY and disclosed here rather than only
 * narratively in the report, against two criteria frozen BEFORE this
 * script was run (see the report's pre-registration section):
 *
 *   1. Deflated Sharpe Ratio (24-trial-pool-corrected, computed by the
 *      funnel script) < 0.5 => not more likely than not to reflect real
 *      skill after correction => DOWNGRADE mechanical CANDIDATE to
 *      RESEARCH.
 *   2. |correlation vs RS3M| classified LOW diversification value
 *      (>0.6, per `portfolio-vs-rs3m.ts`'s own threshold) => fails the
 *      brief's explicit §25 "independencia útil vs RS3M" minimum
 *      candidate criterion => DOWNGRADE.
 *
 * Also: R3-A and R3-B (Family 3) are STRUCTURALLY nested — R3-B's
 * trades are a regime-filtered SUBSET of R3-A's (same base pullback
 * signal, R3-A is the unfiltered baseline) — so even though both clear
 * the two bars above mechanically, they are counted as ONE genuine
 * finding, not two independent candidates (R3-A is reported as R3-B's
 * ablation baseline). This nesting rule is likewise frozen before
 * results were reviewed (this is the family's only regime-nested pair
 * in the whole 30-experiment set — Family 5's regime pairs are already
 * excluded by the DSR rule above, and Family 1/4 have no such nesting).
 *
 * Writes: results/block8-3/candidates/, results/block8-3/rejected/,
 * results/block8-3/multiple-testing/review.json
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/us-index/run-block8-3-review.ts
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EXPERIMENTS_DIR = join(process.cwd(), "results", "block8-3", "experiments");
const CANDIDATES_DIR = join(process.cwd(), "results", "block8-3", "candidates");
const REJECTED_DIR = join(process.cwd(), "results", "block8-3", "rejected");
const MULTIPLE_TESTING_DIR = join(process.cwd(), "results", "block8-3", "multiple-testing");

const DSR_MIN_FOR_CANDIDATE = 0.5;
/** R3-B is a regime-filtered SUBSET of R3-A's trades — see module docstring. */
const NESTED_BASELINE_OF: Record<string, string> = { "R3-A": "R3-B" };

interface ReviewedExperiment {
  experimentId: string;
  family: string;
  mechanicalClassification: string;
  deflatedSharpeRatio: number | null;
  correlationVsRs3m: { returnCorrelation: number | null; diversificationValue: string } | null;
  finalStatus: "REJECTED" | "DATA_INSUFFICIENT" | "RESEARCH" | "CANDIDATE";
  overrideReasons: string[];
}

function reviewOne(json: Record<string, unknown>): ReviewedExperiment {
  const experimentId = json.experimentId as string;
  const family = json.family as string;
  const mechanicalClassification = json.classification as string;
  const dsr = (json.deflatedSharpeRatio as number | null | undefined) ?? null;
  const corr = json.correlationVsRs3m as { returnCorrelation: number | null; diversificationValue: string } | null;
  const numMonths = json.numMonths as number;

  const overrideReasons: string[] = [];
  let finalStatus: ReviewedExperiment["finalStatus"];

  if (mechanicalClassification === "REJECTED") {
    // Family 2's short-history configs are REJECTED via the sanity gate (numMonths < 36) specifically because of the documented critical intraday-history limitation, not a cost/edge failure — labeled DATA_INSUFFICIENT here to distinguish "we couldn't test this properly" from "we tested it and it failed," per §26 of the brief.
    finalStatus = family.startsWith("2:") && numMonths < 36 ? "DATA_INSUFFICIENT" : "REJECTED";
  } else if (mechanicalClassification === "RESEARCH") {
    finalStatus = "RESEARCH";
  } else {
    // Mechanical CANDIDATE — apply the two override criteria.
    if (dsr === null || dsr < DSR_MIN_FOR_CANDIDATE) {
      overrideReasons.push(`Deflated Sharpe Ratio ${dsr === null ? "unavailable" : dsr.toFixed(4)} is below the ${DSR_MIN_FOR_CANDIDATE} bar — after multiple-testing correction, not more likely than not to reflect real skill.`);
    }
    if (corr && corr.diversificationValue === "LOW") {
      overrideReasons.push(`Correlation vs RS3M ${corr.returnCorrelation?.toFixed(3) ?? "n/a"} => LOW diversification value — fails the brief's "independencia útil vs RS3M" minimum candidate criterion (§25).`);
    }
    if (NESTED_BASELINE_OF[experimentId]) {
      overrideReasons.push(`Structurally nested with ${NESTED_BASELINE_OF[experimentId]} (same base signal, that config is the regime-filtered improvement) — reported as its ablation baseline, not counted as an independent candidate.`);
    }
    finalStatus = overrideReasons.length > 0 ? "RESEARCH" : "CANDIDATE";
  }

  return { experimentId, family, mechanicalClassification, deflatedSharpeRatio: dsr, correlationVsRs3m: corr, finalStatus, overrideReasons };
}

function main(): void {
  mkdirSync(CANDIDATES_DIR, { recursive: true });
  mkdirSync(REJECTED_DIR, { recursive: true });
  mkdirSync(MULTIPLE_TESTING_DIR, { recursive: true });

  const files = readdirSync(EXPERIMENTS_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
  const reviewed: ReviewedExperiment[] = [];

  for (const file of files) {
    const json = JSON.parse(readFileSync(join(EXPERIMENTS_DIR, file), "utf8"));
    const result = reviewOne(json);
    reviewed.push(result);

    if (result.finalStatus === "CANDIDATE") {
      writeFileSync(join(CANDIDATES_DIR, `${result.experimentId}.json`), JSON.stringify({ ...json, review: result }, null, 2));
    } else if (result.finalStatus === "REJECTED" || result.finalStatus === "DATA_INSUFFICIENT") {
      writeFileSync(join(REJECTED_DIR, `${result.experimentId}.json`), JSON.stringify({ ...json, review: result }, null, 2));
    }
  }

  writeFileSync(join(MULTIPLE_TESTING_DIR, "review.json"), JSON.stringify({ generatedAt: new Date().toISOString(), dsrMinForCandidate: DSR_MIN_FOR_CANDIDATE, nestedBaselineOf: NESTED_BASELINE_OF, reviewed }, null, 2));

  console.log("[Block 8.3 review] Final status counts:");
  const counts = new Map<string, number>();
  for (const r of reviewed) counts.set(r.finalStatus, (counts.get(r.finalStatus) ?? 0) + 1);
  for (const [status, n] of counts) console.log(`  ${status}: ${n}`);
  console.log("\nFinal CANDIDATEs:", reviewed.filter((r) => r.finalStatus === "CANDIDATE").map((r) => r.experimentId).join(", ") || "(none)");
}

main();
