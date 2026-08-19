import "server-only";

import { createAlpacaPaperBrokerAdapter } from "@/novacore/broker/alpaca-paper-broker-adapter";
import { combineHealth } from "@/novacore/health/aggregator";
import type { HealthCheck, HealthSummary } from "@/novacore/shared/types";
import { getRs3mStrategy } from "@/novacore/strategy-hub/adapters/rs3m-adapter";

/**
 * Block 7 — RS3M system health (NOT strategy performance; see
 * `aggregator.ts`'s doc comment). Combines: candidate-hash integrity (a
 * read of the same tripwire `safety-guards.ts` re-checks before every
 * real order), broker credential presence (never the credential value),
 * live status-file availability, and the documented Routine validation
 * record.
 */
export async function getRs3mHealth(): Promise<HealthSummary> {
  const { candidateHashVerified, liveStatusAvailable } = getRs3mStrategy();
  const brokerHealth = await createAlpacaPaperBrokerAdapter().getHealth();

  const checks: HealthCheck[] = [
    {
      name: "Candidate hash integrity",
      status: candidateHashVerified ? "HEALTHY" : "ERROR",
      detail: candidateHashVerified
        ? "computeCandidateHash(RS3M_CANDIDATE_V1) matches the independently pinned EXPECTED_RS3M_CANDIDATE_V1_HASH (safety-guards.ts)."
        : "Candidate hash mismatch — the frozen RS3M_CANDIDATE_V1 definition may have been edited. This would also block real order submission via safety-guards.ts.",
    },
    {
      name: "Broker credentials",
      status: brokerHealth.status,
      detail: brokerHealth.detail,
    },
    {
      name: "Live status file",
      status: liveStatusAvailable ? "HEALTHY" : "WARNING",
      detail: liveStatusAvailable
        ? "results/block6/candidate/rs3m-v1-status.json found — using the live, persisted status history."
        : "results/block6/candidate/rs3m-v1-status.json not found in this environment (gitignored, machine-specific) — falling back to the documented status in docs/RS3M_FORWARD_PAPER_TRACKING.md.",
    },
    {
      name: "Routine (documented)",
      status: "HEALTHY",
      detail: "docs/RS3M_FORWARD_PAPER_TRACKING.md records the NYSE-aware daily Routine as created and validated (two manual fires, no errors, 2026-08-17). Live Routine health is not observable from within this application.",
    },
  ];

  return combineHealth(checks);
}
