import "server-only";

import { getAlpacaPaperTradingBaseUrl } from "@/core/execution/alpaca-paper-client";
import { EXPECTED_RS3M_CANDIDATE_V1_HASH } from "@/core/paper-trading/rs3m/safety-guards";
import { createAlpacaPaperBrokerAdapter } from "@/novacore/broker/alpaca-paper-broker-adapter";
import { getRs3mCurrentSignal } from "@/novacore/strategy-hub/adapters/rs3m-signal-adapter";
import { getRs3mStrategy } from "@/novacore/strategy-hub/adapters/rs3m-adapter";
import type { DataProvenance } from "@/novacore/shared/types";
import { readForwardEvidenceLedger } from "../../../../scripts/block6/paper/forward-evidence-store";

/**
 * Block 7 / Observability Upgrade — "Execution Safety" panel: one row per
 * safety guard `safety-guards.ts` actually enforces, plus credentials.
 * READ-ONLY throughout: `getAlpacaPaperTradingBaseUrl` is a pure getter
 * (no network call, exported specifically so callers like this one can
 * re-assert the paper-only guarantee without importing anything
 * write-capable). Guards that only have meaning once a real signal has
 * been computed (freshness, duplicate execution, symbol/short/leverage
 * validation, approval) report `UNAVAILABLE` — never `PASS` — when no
 * dry-run has ever produced a ledger row in this environment; a guard
 * NEVER shows PASS "by assumption".
 */

export type GuardStatus = "PASS" | "BLOCKED" | "AWAITING_APPROVAL" | "UNAVAILABLE";

export interface GuardCheck {
  name: string;
  guardCode: string;
  status: GuardStatus;
  detail: string;
}

export interface Rs3mExecutionSafety {
  guards: GuardCheck[];
  overallStatus: GuardStatus;
  approvalStatus: "REQUIRED" | "APPROVED" | "NOT_APPROVED" | "N/A";
  ordersSubmitted: number;
  executionMode: "PAPER";
  liveStatus: "STRUCTURALLY_DISABLED";
  paperEndpoint: string;
  provenance: DataProvenance;
  source: string;
}

const PLAN_DEPENDENT_GUARDS: { code: string; name: string }[] = [
  { code: "STALE_SIGNAL", name: "Signal freshness" },
  { code: "IDEMPOTENCY", name: "Duplicate execution" },
  { code: "SYMBOL_WHITELIST", name: "Symbol validation" },
  { code: "NO_SHORTS", name: "Short validation" },
  { code: "NO_LEVERAGE", name: "Leverage validation" },
  { code: "APPROVAL_REQUIRED", name: "Approval" },
];

function severityRank(status: GuardStatus): number {
  return { PASS: 0, UNAVAILABLE: 1, AWAITING_APPROVAL: 2, BLOCKED: 3 }[status];
}

export async function getRs3mExecutionSafety(): Promise<Rs3mExecutionSafety> {
  const { strategy, candidateHashVerified } = getRs3mStrategy();
  const signal = getRs3mCurrentSignal();
  const brokerHealth = await createAlpacaPaperBrokerAdapter().getHealth();
  const paperEndpoint = getAlpacaPaperTradingBaseUrl();

  const guards: GuardCheck[] = [];

  guards.push({
    name: "Paper endpoint",
    guardCode: "PAPER_ONLY",
    status: paperEndpoint === "https://paper-api.alpaca.markets/v2" ? "PASS" : "BLOCKED",
    detail: `Trading client base URL: ${paperEndpoint}.`,
  });

  guards.push({
    name: "Candidate hash integrity",
    guardCode: "CANDIDATE_HASH_MISMATCH",
    status: candidateHashVerified ? "PASS" : "BLOCKED",
    detail: candidateHashVerified
      ? `computeCandidateHash(RS3M_CANDIDATE_V1) matches the pinned hash (${EXPECTED_RS3M_CANDIDATE_V1_HASH}).`
      : `Hash mismatch — the frozen candidate definition may have been edited. Expected ${EXPECTED_RS3M_CANDIDATE_V1_HASH}, got ${strategy.candidateHash}.`,
  });

  guards.push({
    name: "Credentials configured",
    guardCode: "CREDENTIALS",
    status: brokerHealth.credentialsConfigured ? "PASS" : "UNAVAILABLE",
    detail: brokerHealth.detail,
  });

  const hasSignal = signal.status !== "UNAVAILABLE";
  for (const { code, name } of PLAN_DEPENDENT_GUARDS) {
    if (!hasSignal) {
      guards.push({ name, guardCode: code, status: "UNAVAILABLE", detail: "No signal has been computed in this environment yet (results/block6/forward/ledger.jsonl has no rows) — this guard cannot be evaluated." });
      continue;
    }
    const violation = signal.guardViolations.find((v) => v.guard === code);
    if (!violation) {
      guards.push({ name, guardCode: code, status: "PASS", detail: `No violation recorded for this guard in the ${signal.decisionMonth ?? signal.currentDecisionMonth} dry-run.` });
    } else {
      guards.push({ name, guardCode: code, status: code === "APPROVAL_REQUIRED" ? "AWAITING_APPROVAL" : "BLOCKED", detail: violation.reason });
    }
  }

  const overallStatus = guards.reduce<GuardStatus>((worst, g) => (severityRank(g.status) > severityRank(worst) ? g.status : worst), "PASS");

  const approvalGuard = guards.find((g) => g.guardCode === "APPROVAL_REQUIRED");
  const approvalStatus: Rs3mExecutionSafety["approvalStatus"] =
    approvalGuard?.status === "UNAVAILABLE" ? "N/A" : approvalGuard?.status === "AWAITING_APPROVAL" ? "REQUIRED" : approvalGuard?.status === "PASS" && hasSignal ? "APPROVED" : "NOT_APPROVED";

  const ordersSubmitted = readForwardEvidenceLedger()
    .filter((row) => row.finalState === "EXECUTED")
    .reduce((sum, row) => sum + row.submittedOrders.length, 0);

  return {
    guards,
    overallStatus,
    approvalStatus,
    ordersSubmitted,
    executionMode: "PAPER",
    liveStatus: "STRUCTURALLY_DISABLED",
    paperEndpoint,
    provenance: hasSignal ? "FORWARD_EVIDENCE" : "LIVE",
    source: "src/core/paper-trading/rs3m/safety-guards.ts guard identifiers, cross-referenced with results/block6/forward/ledger.jsonl (read-only)",
  };
}
