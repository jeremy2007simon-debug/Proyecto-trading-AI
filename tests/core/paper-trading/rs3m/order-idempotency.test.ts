import { describe, expect, it } from "vitest";
import { buildClientOrderId, isOrderStatusTerminal, reconcileExistingOrdersForMonth } from "@/core/paper-trading/rs3m/order-idempotency";
import type { AlpacaOrder } from "@/core/execution/alpaca-paper-client";
import type { RebalancePlanOrder } from "@/core/paper-trading/rs3m/rebalance-planner";

function alpacaOrder(overrides: Partial<AlpacaOrder> = {}): AlpacaOrder {
  return {
    orderId: "o1",
    clientOrderId: "rs3m-2026-04-spy-buy",
    symbol: "SPY",
    side: "buy",
    notional: 10000,
    qty: undefined,
    status: "accepted",
    submittedAt: "2026-04-29T13:30:00Z",
    filledAt: undefined,
    filledAvgPrice: undefined,
    filledQty: undefined,
    ...overrides,
  };
}

describe("buildClientOrderId", () => {
  it("is deterministic and lowercases the symbol", () => {
    expect(buildClientOrderId("2026-04", "SPY", "buy")).toBe("rs3m-2026-04-spy-buy");
    expect(buildClientOrderId("2026-04", "SPY", "sell")).toBe("rs3m-2026-04-spy-sell");
  });
});

describe("isOrderStatusTerminal", () => {
  it("treats filled/canceled/expired/rejected/replaced/done_for_day as terminal", () => {
    for (const status of ["filled", "canceled", "expired", "rejected", "replaced", "done_for_day"]) {
      expect(isOrderStatusTerminal(status)).toBe(true);
    }
  });

  it("treats new/accepted/partially_filled/pending_new as NOT terminal (still in flight)", () => {
    for (const status of ["new", "accepted", "partially_filled", "pending_new"]) {
      expect(isOrderStatusTerminal(status)).toBe(false);
    }
  });
});

describe("reconcileExistingOrdersForMonth", () => {
  const plannedOrders: RebalancePlanOrder[] = [{ symbol: "SPY", side: "buy", notionalUsd: 10000, reason: "x" }];

  it("puts an order with no broker-side match into toSubmit", () => {
    const result = reconcileExistingOrdersForMonth([], "2026-04", plannedOrders);
    expect(result.toSubmit).toEqual(plannedOrders);
    expect(result.alreadySubmitted).toEqual([]);
    expect(result.failedPriorAttempts).toEqual([]);
  });

  it("classifies a live/filled broker match as alreadySubmitted — never resubmit", () => {
    const existing = alpacaOrder({ status: "filled" });
    const result = reconcileExistingOrdersForMonth([existing], "2026-04", plannedOrders);
    expect(result.toSubmit).toEqual([]);
    expect(result.alreadySubmitted).toEqual([existing]);
  });

  it("classifies a still-open (accepted/new/partially_filled) broker match as alreadySubmitted too — an open order must not be duplicated", () => {
    for (const status of ["accepted", "new", "partially_filled"]) {
      const existing = alpacaOrder({ status });
      const result = reconcileExistingOrdersForMonth([existing], "2026-04", plannedOrders);
      expect(result.toSubmit).toEqual([]);
      expect(result.alreadySubmitted).toEqual([existing]);
    }
  });

  it("classifies a terminally-failed broker match (rejected/canceled/expired) as failedPriorAttempts, not toSubmit", () => {
    for (const status of ["rejected", "canceled", "expired"]) {
      const existing = alpacaOrder({ status });
      const result = reconcileExistingOrdersForMonth([existing], "2026-04", plannedOrders);
      expect(result.toSubmit).toEqual([]);
      expect(result.failedPriorAttempts).toEqual([existing]);
    }
  });

  it("matches strictly by clientOrderId — an order for a different month/symbol never matches", () => {
    const unrelated = alpacaOrder({ clientOrderId: "rs3m-2026-03-qqq-buy" });
    const result = reconcileExistingOrdersForMonth([unrelated], "2026-04", plannedOrders);
    expect(result.toSubmit).toEqual(plannedOrders);
    expect(result.alreadySubmitted).toEqual([]);
  });

  it("handles a two-order rebalance (sell + buy) independently — one already submitted, one not", () => {
    const twoOrders: RebalancePlanOrder[] = [
      { symbol: "QQQ", side: "sell", notionalUsd: 10000, reason: "x" },
      { symbol: "SPY", side: "buy", notionalUsd: 10000, reason: "x" },
    ];
    const existingSell = alpacaOrder({ clientOrderId: "rs3m-2026-04-qqq-sell", symbol: "QQQ", side: "sell", status: "filled" });
    const result = reconcileExistingOrdersForMonth([existingSell], "2026-04", twoOrders);
    expect(result.alreadySubmitted).toEqual([existingSell]);
    expect(result.toSubmit).toEqual([twoOrders[1]]);
  });
});
