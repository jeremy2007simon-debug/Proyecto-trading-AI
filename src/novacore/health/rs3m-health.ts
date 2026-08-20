import "server-only";

import { createAlpacaPaperBrokerAdapter } from "@/novacore/broker/alpaca-paper-broker-adapter";
import { combineHealth } from "@/novacore/health/aggregator";
import { getSpyBenchmarkSeries } from "@/novacore/market-context/adapters/spy-benchmark-adapter";
import type { HealthCheck, HealthSummary } from "@/novacore/shared/types";
import { getRs3mStrategy } from "@/novacore/strategy-hub/adapters/rs3m-adapter";
import { readForwardEvidenceLedger } from "../../../scripts/block6/paper/forward-evidence-store";

const STALE_MARKET_DATA_HOURS = 30;

/**
 * Block 7 / Observability Upgrade — RS3M system health (NOT strategy
 * performance; see `aggregator.ts`'s doc comment). Every check here is
 * either a pure/structural verification (candidate hash, paper endpoint —
 * already true regardless of environment) or an honest report of whether
 * a real source is reachable — an expected absence (no credentials in
 * this environment, no forward evidence yet) is reported as `WARNING`,
 * never escalated into a false `ERROR`.
 */
export async function getRs3mHealth(): Promise<HealthSummary> {
  const { candidateHashVerified, liveStatusAvailable } = getRs3mStrategy();
  const broker = createAlpacaPaperBrokerAdapter();
  const [brokerHealth, accountResult, spySeries] = await Promise.all([broker.getHealth(), broker.getAccount(), getSpyBenchmarkSeries("1D")]);

  const ledger = readForwardEvidenceLedger();
  const hasForwardEvidence = ledger.length > 0;

  let marketDataStatus: HealthCheck["status"];
  let marketDataDetail: string;
  if (!spySeries.available) {
    marketDataStatus = "WARNING";
    marketDataDetail = `Market data unavailable: ${spySeries.unavailableReason}`;
  } else {
    const ageHours = spySeries.lastTimestamp ? (Date.now() - new Date(spySeries.lastTimestamp).getTime()) / (60 * 60 * 1000) : Infinity;
    marketDataStatus = ageHours <= STALE_MARKET_DATA_HOURS ? "HEALTHY" : "WARNING";
    marketDataDetail = `Latest SPY candle: ${spySeries.lastTimestamp} (${ageHours.toFixed(1)}h old). Threshold: ${STALE_MARKET_DATA_HOURS}h.`;
  }

  const checks: HealthCheck[] = [
    {
      name: "NovaCore API",
      status: "HEALTHY",
      detail: "This request completed — the NovaCore API/adapter layer is responsive by definition.",
    },
    {
      name: "Candidate hash integrity",
      status: candidateHashVerified ? "HEALTHY" : "ERROR",
      detail: candidateHashVerified
        ? "computeCandidateHash(RS3M_CANDIDATE_V1) matches the independently pinned EXPECTED_RS3M_CANDIDATE_V1_HASH (safety-guards.ts)."
        : "Candidate hash mismatch — the frozen RS3M_CANDIDATE_V1 definition may have been edited. This would also block real order submission via safety-guards.ts.",
    },
    {
      name: "Paper broker connectivity",
      status: accountResult.ok ? "HEALTHY" : brokerHealth.credentialsConfigured ? "ERROR" : "WARNING",
      detail: accountResult.ok
        ? `Live Alpaca PAPER account read succeeded (account ${accountResult.value.accountId}).`
        : brokerHealth.credentialsConfigured
          ? `Credentials are configured but the live read failed: ${accountResult.error.message}.`
          : "Paper credentials are not configured in this deployment — connectivity cannot be tested. This is an expected state, not a failure.",
    },
    {
      name: "Credentials configured",
      status: brokerHealth.credentialsConfigured ? "HEALTHY" : "WARNING",
      detail: brokerHealth.detail,
    },
    {
      name: "Forward evidence",
      status: hasForwardEvidence ? "HEALTHY" : "WARNING",
      detail: hasForwardEvidence
        ? `${ledger.length} row(s) recorded in results/block6/forward/ledger.jsonl.`
        : "No forward evidence recorded yet in this environment — expected before the first completed Paper rebalance period (see docs/RS3M_FORWARD_PAPER_TRACKING.md).",
    },
    {
      name: "Market data freshness",
      status: marketDataStatus,
      detail: marketDataDetail,
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
