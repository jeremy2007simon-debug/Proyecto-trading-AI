import type { HealthStatus, NovaCoreEnvironment } from "@/novacore/shared/types";

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
    detail: string;
  };

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
