import type { DataProvenance, HealthStatus, NovaCoreEnvironment } from "@/novacore/shared/types";

/**
 * Block 7, section 8 — Execution Center. READ / MONITOR only (section 8's
 * explicit instruction: no buttons that bypass existing safety guards).
 * Every field is sourced from a real persisted record or a live read-only
 * broker call — never invented.
 */
export interface ExecutionCenterSnapshot {
  strategyId: string;
  broker: string;
  environment: NovaCoreEnvironment;
  candidateHash: string;

  currentPosition: {
    state: "CASH" | "HOLDING" | "UNKNOWN";
    symbol?: string;
    marketValue?: number;
    unrealizedPl?: number;
    unrealizedPlPct?: number;
    detail: string;
    provenance: DataProvenance;
  };

  /** Always "PAPER" — RS3M has no LIVE execution path anywhere in this codebase. */
  executionMode: "PAPER";
  liveStatus: "STRUCTURALLY_DISABLED";

  lastKnownSignal:
    | {
        decisionMonth: string;
        winner: string | undefined;
        recordedAt: string;
      }
    | undefined;

  ordersSubmittedTotal: number;

  approval: {
    currentDecisionMonth: string;
    required: boolean;
    approvedForCurrentMonth: boolean;
    awaitingApproval: boolean;
  };

  routine: {
    status: HealthStatus;
    detail: string;
  };

  sourceOfTruth: Record<string, string>;
}
