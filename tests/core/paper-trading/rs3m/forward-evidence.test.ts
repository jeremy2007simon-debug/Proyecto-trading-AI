import { describe, expect, it } from "vitest";
import { buildForwardEvidenceRecord } from "@/core/paper-trading/rs3m/forward-evidence";
import { computeCandidateHash, RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import type { AlpacaAccount, AlpacaOrder, AlpacaPosition } from "@/core/execution/alpaca-paper-client";
import type { Rs3mExecuteResult, Rs3mPlanResult } from "@/core/paper-trading/rs3m/rs3m-engine";

function account(overrides: Partial<AlpacaAccount> = {}): AlpacaAccount {
  return { accountId: "a1", status: "ACTIVE", currency: "USD", cash: 10000, portfolioValue: 10000, equity: 10000, buyingPower: 20000, patternDayTrader: false, tradingBlocked: false, accountBlocked: false, ...overrides };
}

function position(overrides: Partial<AlpacaPosition> = {}): AlpacaPosition {
  return { symbol: "QQQ", qty: 10, side: "long", marketValue: 9000, avgEntryPrice: 850, currentPrice: 900, unrealizedPl: 500, ...overrides };
}

function alpacaOrder(overrides: Partial<AlpacaOrder> = {}): AlpacaOrder {
  return { orderId: "o1", clientOrderId: "rs3m-2026-08-spy-buy", symbol: "SPY", side: "buy", notional: 10000, qty: undefined, status: "filled", submittedAt: "2026-09-01T13:35:00Z", filledAt: "2026-09-01T13:35:02Z", filledAvgPrice: 501.23, filledQty: 19.95, ...overrides };
}

function basePlanResult(overrides: Partial<Rs3mPlanResult> = {}): Rs3mPlanResult {
  return {
    signal: { decisionMonth: "2026-08", dataCutoffTimestamp: "2026-08-31T20:00:00Z", ranking: [{ market: "DOWJONES", trailingReturnPct: 5.9 }], selectedMarket: "DOWJONES" },
    plan: { currentAsset: "QQQ", targetAsset: "DIA", isRebalanceNeeded: true, orders: [{ symbol: "QQQ", side: "sell", notionalUsd: 9000, reason: "x" }, { symbol: "DIA", side: "buy", notionalUsd: 10000, reason: "y" }], estimatedTurnoverPct: 100 },
    guardResult: { passed: true, violations: [] },
    wouldExecute: true,
    account: account(),
    positionsBefore: [position()],
    ...overrides,
  };
}

describe("buildForwardEvidenceRecord", () => {
  it("marks EXECUTED and captures fills/order IDs/positions-after when execute() succeeded", () => {
    const executeResult: Rs3mExecuteResult = { planResult: basePlanResult(), ordersSubmitted: [alpacaOrder({ symbol: "QQQ", side: "sell", status: "filled", filledAvgPrice: 900.5 }), alpacaOrder()], skipped: false, anyOrderStillInFlight: false };

    const record = buildForwardEvidenceRecord({ nowIso: "2026-09-01T13:36:00Z", planResult: basePlanResult(), executeResult, positionsAfter: [{ symbol: "DIA", marketValue: 10000 }], accountEquityAfterUsd: 99850.5 });

    expect(record.finalState).toBe("EXECUTED");
    expect(record.candidateId).toBe("RS3M_CANDIDATE_V1");
    expect(record.candidateHash).toBe(computeCandidateHash(RS3M_CANDIDATE_V1));
    expect(record.submittedOrders).toHaveLength(2);
    expect(record.submittedOrders[1].orderId).toBe("o1");
    expect(record.averageFillPriceBySymbol).toEqual({ QQQ: 900.5, SPY: 501.23 });
    expect(record.positionsAfter).toEqual([{ symbol: "DIA", marketValue: 10000 }]);
    expect(record.accountEquityAfterUsd).toBe(99850.5);
    expect(record.mode).toBe("PAPER_ONLY");
  });

  it("marks BLOCKED and records guard violations when the plan itself would not execute", () => {
    const blockedPlan = basePlanResult({ wouldExecute: false, guardResult: { passed: false, violations: [{ guard: "STALE_SIGNAL", reason: "too old" }] } });

    const record = buildForwardEvidenceRecord({ nowIso: "2026-09-01T13:36:00Z", planResult: blockedPlan });

    expect(record.finalState).toBe("BLOCKED");
    expect(record.guardViolations).toEqual([{ guard: "STALE_SIGNAL", reason: "too old" }]);
    expect(record.submittedOrders).toEqual([]);
  });

  it("marks NO_REBALANCE_NEEDED distinctly from a real block", () => {
    const noRebalance = basePlanResult({ wouldExecute: false, blockedReason: "NO_REBALANCE_NEEDED", plan: { currentAsset: "DIA", targetAsset: "DIA", isRebalanceNeeded: false, orders: [], estimatedTurnoverPct: 0 } });

    const record = buildForwardEvidenceRecord({ nowIso: "2026-09-01T13:36:00Z", planResult: noRebalance });

    expect(record.finalState).toBe("NO_REBALANCE_NEEDED");
  });

  it("marks SKIPPED and records the skip reason when execute() itself declined (e.g. an order API failure)", () => {
    const executeResult: Rs3mExecuteResult = { planResult: basePlanResult(), ordersSubmitted: [], skipped: true, skipReason: "Order submission failed for DIA buy: insufficient buying power" };

    const record = buildForwardEvidenceRecord({ nowIso: "2026-09-01T13:36:00Z", planResult: basePlanResult(), executeResult });

    expect(record.finalState).toBe("SKIPPED");
    expect(record.skipReason).toContain("insufficient buying power");
  });

  it("never contains a credential-shaped field name (structural safety — this ledger is committed/inspected freely)", () => {
    const record = buildForwardEvidenceRecord({ nowIso: "2026-09-01T13:36:00Z", planResult: basePlanResult() });
    const keys = Object.keys(record).join(",").toLowerCase();
    expect(keys).not.toMatch(/secret|apikey|api_key|token|password/);
  });

  it("always tags mode as PAPER_ONLY regardless of outcome", () => {
    const blocked = buildForwardEvidenceRecord({ nowIso: "t", planResult: basePlanResult({ wouldExecute: false }) });
    expect(blocked.mode).toBe("PAPER_ONLY");
  });
});
