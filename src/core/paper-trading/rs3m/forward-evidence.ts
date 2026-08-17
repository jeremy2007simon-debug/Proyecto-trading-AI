import type { AlpacaOrder } from "@/core/execution/alpaca-paper-client";
import { computeCandidateHash, RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import type { Rs3mExecuteResult, Rs3mPlanResult } from "@/core/paper-trading/rs3m/rs3m-engine";

/**
 * Block 6, forward-testing evidence — the schema for ONE append-only
 * ledger row per rebalance attempt (executed OR blocked; a blocked
 * attempt is still evidence, never dropped). Deliberately kept SEPARATE
 * from the Block 5 backtest results and the Block 6 OOS analysis: this is
 * PAPER FORWARD evidence, and per the spec must never be retroactively
 * mixed into the dataset used to justify `RS3M_CANDIDATE_V1` in the first
 * place. `scripts/block6/paper/forward-evidence-store.ts` is the only
 * writer, appending JSONL to `results/block6/forward/ledger.jsonl`
 * (distinct from `results/block6/paper/events.log`'s internal audit
 * trail, and from `results/block6/candidate/rs3m-v1-status.json`'s
 * status history).
 *
 * Pure builder — no I/O, no timestamp generation (`nowIso` is passed in).
 * Never includes credentials: every field here is either already public
 * account/order data returned by Alpaca, or derived from it.
 */

export interface ForwardEvidencePosition {
  symbol: string;
  marketValue: number;
}

export interface ForwardEvidenceSubmittedOrder {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  notionalUsd: number | undefined;
  status: string;
  filledAt: string | undefined;
  filledAvgPrice: number | undefined;
  filledQty: number | undefined;
}

export type ForwardEvidenceFinalState = "EXECUTED" | "BLOCKED" | "NO_REBALANCE_NEEDED" | "SKIPPED";

export interface ForwardEvidenceRecord {
  timestamp: string;
  candidateId: string;
  candidateHash: string;
  decisionMonth: string | undefined;
  dataCutoff: string | undefined;
  ranking: { market: string; trailingReturnPct: number }[];
  winner: string | undefined;
  accountEquityUsd: number | undefined;
  positionsBefore: ForwardEvidencePosition[] | undefined;
  targetAsset: string | undefined;
  proposedOrders: { symbol: string; side: "buy" | "sell"; notionalUsd: number; reason: string }[];
  submittedOrders: ForwardEvidenceSubmittedOrder[];
  averageFillPriceBySymbol: Record<string, number>;
  estimatedTurnoverPct: number | undefined;
  referenceRebalanceCostBps: number;
  positionsAfter: ForwardEvidencePosition[] | undefined;
  guardViolations: { guard: string; reason: string }[];
  finalState: ForwardEvidenceFinalState;
  skipReason: string | undefined;
  anyOrderStillInFlight: boolean | undefined;
  /** Structural reminder this row can only ever describe a PAPER account — never LIVE (see `safety-guards.ts#assertPaperOnly`, enforced independently of this record). */
  mode: "PAPER_ONLY";
}

function averageFillPriceBySymbol(orders: readonly AlpacaOrder[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const order of orders) {
    if (order.filledAvgPrice !== undefined) result[order.symbol] = order.filledAvgPrice;
  }
  return result;
}

export interface BuildForwardEvidenceParams {
  nowIso: string;
  planResult: Rs3mPlanResult;
  executeResult?: Rs3mExecuteResult;
  /** Positions read AFTER execution (or `undefined` for a dry-run/blocked attempt that never traded). A fresh `getPositions()` call by the caller — the engine's own return shape only carries the BEFORE snapshot. */
  positionsAfter?: ForwardEvidencePosition[];
}

export function buildForwardEvidenceRecord(params: BuildForwardEvidenceParams): ForwardEvidenceRecord {
  const { planResult, executeResult } = params;
  const submittedOrders: AlpacaOrder[] = executeResult?.ordersSubmitted ?? [];

  const finalState: ForwardEvidenceFinalState =
    executeResult && !executeResult.skipped
      ? "EXECUTED"
      : executeResult?.skipped
        ? "SKIPPED"
        : planResult.blockedReason === "NO_REBALANCE_NEEDED"
          ? "NO_REBALANCE_NEEDED"
          : "BLOCKED";

  return {
    timestamp: params.nowIso,
    candidateId: RS3M_CANDIDATE_V1.candidateId,
    candidateHash: computeCandidateHash(RS3M_CANDIDATE_V1),
    decisionMonth: planResult.signal?.decisionMonth,
    dataCutoff: planResult.signal?.dataCutoffTimestamp,
    ranking: planResult.signal?.ranking ?? [],
    winner: planResult.signal?.selectedMarket,
    accountEquityUsd: planResult.account?.equity,
    positionsBefore: planResult.positionsBefore?.map((p) => ({ symbol: p.symbol, marketValue: p.marketValue })),
    targetAsset: planResult.plan?.targetAsset,
    proposedOrders: planResult.plan?.orders ?? [],
    submittedOrders: submittedOrders.map((o) => ({
      orderId: o.orderId,
      clientOrderId: o.clientOrderId,
      symbol: o.symbol,
      side: o.side,
      notionalUsd: o.notional,
      status: o.status,
      filledAt: o.filledAt,
      filledAvgPrice: o.filledAvgPrice,
      filledQty: o.filledQty,
    })),
    averageFillPriceBySymbol: averageFillPriceBySymbol(submittedOrders),
    estimatedTurnoverPct: planResult.plan?.estimatedTurnoverPct,
    referenceRebalanceCostBps: RS3M_CANDIDATE_V1.referenceRebalanceCostBps,
    positionsAfter: params.positionsAfter,
    guardViolations: planResult.guardResult.violations,
    finalState,
    skipReason: executeResult?.skipReason,
    anyOrderStillInFlight: executeResult?.anyOrderStillInFlight,
    mode: "PAPER_ONLY",
  };
}
