import type { AlpacaOrder } from "@/core/execution/alpaca-paper-client";
import type { RebalancePlanOrder } from "@/core/paper-trading/rs3m/rebalance-planner";

/**
 * Block 6, forward-testing hardening — BROKER-SIDE idempotency, additive
 * to (never a replacement for) the local file marker in
 * `scripts/block6/paper/idempotency-store.ts`.
 *
 * The local marker is written AFTER a rebalance's orders are submitted
 * (see `run-rebalance.ts`'s `markExecuted` call). If the process crashes,
 * is killed, or loses network between a successful order submission and
 * that write, a naive retry would see `hasExecutedThisMonth() === false`
 * and could resubmit — this module is what prevents that: before
 * submitting anything, `rs3m-engine.ts`'s `execute()` lists the account's
 * actual orders and reconciles them against this month's planned orders
 * by their DETERMINISTIC `clientOrderId` (`rs3m-<month>-<symbol>-<side>`,
 * see `buildClientOrderId` below). Alpaca itself is the source of truth
 * here, not a local file that could be lost.
 *
 * Pure, zero I/O — the caller supplies the already-fetched order list.
 */

/** Deterministic, human-auditable idempotency key: one buy/sell per (decision month, symbol) pair can ever be submitted. Single source of truth for this format — both the engine's submission path and this reconciliation module import it from here. */
export function buildClientOrderId(decisionMonth: string, symbol: string, side: "buy" | "sell"): string {
  return `rs3m-${decisionMonth}-${symbol.toLowerCase()}-${side}`;
}

/**
 * Alpaca order statuses that mean "this attempt did NOT result in a live
 * or filled order" — see https://docs.alpaca.markets/docs/order-lifecycle.
 * A prior attempt landing in one of these is surfaced to a human
 * (`failedPriorAttempts`) rather than silently retried with a new ID:
 * auto-retrying could change execution timing/price versus what the
 * signal/plan assumed, which would quietly corrupt forward-vs-backtest
 * comparability — exactly what the freeze is trying to protect.
 */
const FAILED_TERMINAL_STATUSES = new Set(["canceled", "expired", "rejected"]);

/** Alpaca order statuses considered fully resolved — polling stops here. Everything else (new/accepted/pending_new/partially_filled/accepted_for_bidding/pending_cancel/pending_replace/stopped/suspended/calculated/held) is still in flight. */
const TERMINAL_STATUSES = new Set(["filled", "canceled", "expired", "rejected", "replaced", "done_for_day"]);

export function isOrderStatusTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

export interface OrderReconciliation {
  /** Planned orders with no existing Alpaca order under their deterministic client_order_id — safe to submit. */
  toSubmit: RebalancePlanOrder[];
  /** Planned orders that already exist at the broker (any non-failed status) — must NOT be resubmitted. */
  alreadySubmitted: AlpacaOrder[];
  /** Planned orders whose prior attempt failed terminally (canceled/expired/rejected) — surfaced for a human decision, never auto-retried under a new ID. */
  failedPriorAttempts: AlpacaOrder[];
}

/**
 * Reconciles this decision month's planned orders against the account's
 * ACTUAL existing orders (queried fresh from Alpaca — see the module doc
 * comment for why this, not just the local marker file, is what makes a
 * restart/retry safe). `existingOrders` should be an unfiltered or
 * broadly-filtered list (e.g. `listOrders({ status: "all" })`) — this
 * function does its own matching by `clientOrderId`, so it doesn't matter
 * if `existingOrders` includes orders from other months/strategies.
 */
export function reconcileExistingOrdersForMonth(existingOrders: readonly AlpacaOrder[], decisionMonth: string, plannedOrders: readonly RebalancePlanOrder[]): OrderReconciliation {
  const byClientOrderId = new Map(existingOrders.map((order) => [order.clientOrderId, order]));

  const toSubmit: RebalancePlanOrder[] = [];
  const alreadySubmitted: AlpacaOrder[] = [];
  const failedPriorAttempts: AlpacaOrder[] = [];

  for (const planned of plannedOrders) {
    const clientOrderId = buildClientOrderId(decisionMonth, planned.symbol, planned.side);
    const existing = byClientOrderId.get(clientOrderId);
    if (!existing) {
      toSubmit.push(planned);
    } else if (FAILED_TERMINAL_STATUSES.has(existing.status)) {
      failedPriorAttempts.push(existing);
    } else {
      alreadySubmitted.push(existing);
    }
  }

  return { toSubmit, alreadySubmitted, failedPriorAttempts };
}
