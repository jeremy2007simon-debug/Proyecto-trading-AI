/**
 * Block 6, Fase 24 — writes RS3M_CANDIDATE_V1's actual status history for
 * this session to `results/block6/candidate/rs3m-v1-status.json`.
 *
 * Every transition below is backed by a real, already-completed step in
 * this session (see docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md for the
 * full evidence behind each one) — this script does not compute or infer
 * anything, it just persists the append-only record using the validated
 * `appendTransition` state machine, which will throw loudly if any
 * transition here were ever invalid.
 *
 * Stops at PAPER_READY, not PAPER_RUNNING — no order has ever been
 * submitted this session (see the Block 6 report's decision section for
 * why: a severe recent out-of-sample underperformance finding, and the
 * user's explicit choice to build but not activate paper execution).
 *
 * Run with:
 *   npx tsx scripts/block6/write-status.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendTransition, type StatusTransition } from "@/core/paper-trading/rs3m/status";
import { RS3M_CANDIDATE_V1, computeCandidateHash } from "@/core/paper-trading/rs3m/candidate";

const OUTPUT_DIR = join(process.cwd(), "results", "block6", "candidate");

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  let history: StatusTransition[] = [];
  const steps: { status: Parameters<typeof appendTransition>[1]; reason: string; timestamp: string }[] = [
    {
      status: "CANDIDATE_FROZEN",
      reason: `RS3M_CANDIDATE_V1 frozen from the single Block 5 CANDIDATE (Relative Strength, 3-month lookback). Hash: ${computeCandidateHash(RS3M_CANDIDATE_V1)}.`,
      timestamp: "2026-08-17T09:19:00.000Z",
    },
    {
      status: "AUDIT_PASSED",
      reason:
        "Independent engine audit (Fase 2-4) found no look-ahead bias, no cash-handling/resampling bugs, and an independent non-code-sharing reimplementation reproduced the engine exactly (0 mismatches, 124 rebalances). Full statistical verification (Fase 5-15) completed: cost break-even ~354bps (very robust vs the 20bps reference), Monte Carlo and benchmarks all computed and cross-checked. Confirmed price-adjustment finding (raw vs dividend/split-adjusted) quantified and documented, not hidden.",
      timestamp: "2026-08-17T13:00:00.000Z",
    },
    {
      status: "PAPER_READY",
      reason:
        "Paper-trading infrastructure (Fase 16-19) built and tested: structurally paper-only Alpaca Trading API client, safety guards, rebalance engine with dependency-injected I/O, NYSE-calendar-aware idempotent scheduler. Deliberately NOT advanced to PAPER_RUNNING: no order has been submitted this session (user's explicit decision, given the severe recent out-of-sample underperformance finding in Fase 6-7 — see the Block 6 report's decision section). PAPER_READY means the infrastructure and audit are sound, NOT that the strategy is validated or that paper trading has begun.",
      timestamp: "2026-08-17T15:30:00.000Z",
    },
  ];

  for (const step of steps) {
    const result = appendTransition(history, step.status, step.reason, step.timestamp);
    if (result.error) {
      console.error(`[write-status] Invalid transition, aborting: ${result.error}`);
      process.exitCode = 1;
      return;
    }
    history = result.history;
  }

  const outputPath = join(OUTPUT_DIR, "rs3m-v1-status.json");
  writeFileSync(outputPath, JSON.stringify({ candidateId: RS3M_CANDIDATE_V1.candidateId, candidateHash: computeCandidateHash(RS3M_CANDIDATE_V1), history }, null, 2));
  console.log(`=== Status history written to ${outputPath} ===`);
  console.log(`Current status: ${history.at(-1)!.status}`);
}

main();
