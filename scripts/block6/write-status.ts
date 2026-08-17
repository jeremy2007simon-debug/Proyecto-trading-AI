/**
 * Block 6, Fase 24 + forward-testing activation — writes
 * RS3M_CANDIDATE_V1's actual status history to
 * `results/block6/candidate/rs3m-v1-status.json`.
 *
 * Every transition below is backed by a real, already-completed step
 * (see docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md for the audit
 * evidence, and this session's own record — commits + trigger/session
 * IDs quoted below — for the forward-testing activation) — this script
 * does not compute or infer anything, it just persists the append-only
 * record using the validated `appendTransition` state machine, which
 * will throw loudly if any transition here were ever invalid.
 *
 * PAPER_RUNNING here means ONLY: the NYSE-aware automated Routine exists,
 * is scheduled, and has completed two unattended validation fires without
 * error or permission stalls. It does NOT mean any order has been
 * submitted — the Routine runs DRY_RUN-only and will not submit the first
 * real (paper) order without an explicit human go-ahead that month (see
 * the Routine's own prompt / `scripts/block6/paper/run-rebalance.ts`).
 * `PAPER_RUNNING` is an OPERATIONAL state only — it is NOT `VALIDATED`
 * (that state does not exist anywhere in `status.ts`, deliberately).
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
    {
      status: "PAPER_RUNNING",
      reason:
        "Forward-testing activated per the user's explicit request (commit 06e48a0). Prerequisites: (1) DRY_RUN executed against the real Alpaca paper account (4 manual runs total across this and the prior session), consistently and correctly blocked by STALE_SIGNAL on the July signal — never artificially forced. (2) Infrastructure hardened: broker-side order idempotency surviving restart/retry without duplicating orders, partial-fill polling, new MALFORMED_DATA and CANDIDATE_HASH_MISMATCH safety guards, an append-only forward-evidence ledger kept separate from backtest/OOS data, decoupled notifications, and 633 passing tests (typecheck/lint clean). (3) A NYSE-aware daily Routine (trig_01JbjYAAm2J9s32CbM7NiKpx, weekdays 14:35 UTC, fresh session per fire, pinned to this exact commit) was created and fired twice manually for validation (sessions cse_015fJC7K8a1ugN13iva2HCWQ, cse_01JgtY11evvMAwdg2356mv1S) — both completed without error or permission stalls, in a duration consistent with a full checkout+install+run cycle; the exact per-run classification (STALE_SIGNAL vs NO_OP) was not independently re-read from the fired session's own transcript due to a tool-access limitation, so this is an operational-health confirmation, not a byte-for-byte output match. Per the user's explicit choice, the Routine runs DRY_RUN checks automatically but will NOT submit the first real (paper) order without an explicit human go-ahead that month. PAPER_RUNNING here is an OPERATIONAL state (the automation exists and runs), never a scientific VALIDATED verdict, which remains structurally unreachable in this codebase.",
      timestamp: "2026-08-17T21:25:00.000Z",
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
