import type { RelativeStrengthAssetInput } from "@/core/backtesting/research/relative-strength";
import type { AlpacaAccount, AlpacaOrder, AlpacaPaperTradingClient, AlpacaPosition } from "@/core/execution/alpaca-paper-client";
import { getInstrumentConfig } from "@/core/market-data/instruments";
import { computeCandidateHash, RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { validateAssetCandles } from "@/core/paper-trading/rs3m/data-validation";
import { buildClientOrderId, isOrderStatusTerminal, reconcileExistingOrdersForMonth } from "@/core/paper-trading/rs3m/order-idempotency";
import { planRebalance, type RebalancePlan } from "@/core/paper-trading/rs3m/rebalance-planner";
import { runAllRs3mSafetyGuards, type SafetyGuardResult } from "@/core/paper-trading/rs3m/safety-guards";
import { computeCurrentRs3mSignal, type Rs3mSignal } from "@/core/paper-trading/rs3m/signal-calculator";
import type { Market } from "@/core/shared/types";

/**
 * Block 6, Fase 16/19-20 — the RS3M paper-trading engine: ties the signal
 * calculator, rebalance planner, and safety guards together against a
 * REAL (paper) Alpaca account, and is the ONLY place in this codebase that
 * ever calls `submitNotionalOrder`.
 *
 * Dependency-injected I/O (`Rs3mEngineDependencies`) rather than importing
 * `fetch`/`fs` directly — this file's own logic stays pure/testable with
 * fakes, and the real Alpaca client + real idempotency-marker file
 * reader/writer are wired up one layer out, in the script that actually
 * runs this (`scripts/block6/paper/run-rebalance.ts`), matching the
 * "core has zero direct I/O" convention used everywhere else in this
 * codebase.
 *
 * `dryRun()` NEVER calls `submitNotionalOrder` — only read-only calls
 * (`getAccount`, `getPositions`, `listOrders`) already used elsewhere.
 * `execute()` is the only path that submits real (paper) orders, and only
 * proceeds when `dryRun()`'s own guard result would have passed — "si
 * cualquier safeguard falla: NO OPERAR." `execute()` additionally
 * reconciles against the broker's OWN order history (`order-idempotency.ts`)
 * before submitting anything, so a crash/retry between a successful
 * submission and the local idempotency-marker write can never duplicate
 * an order — see that module's doc comment.
 */

/** Re-exported for backward compatibility — callers/tests that import this from the engine keep working; `order-idempotency.ts` is the single source of truth for the format. */
export { buildClientOrderId };

export interface Rs3mEngineDependencies {
  tradingClient: AlpacaPaperTradingClient;
  /** Reads the idempotency marker for `decisionMonth` — see `safety-guards.ts`'s `assertNotAlreadyExecutedThisMonth`. */
  hasExecutedThisMonth(decisionMonth: string): Promise<boolean>;
  nowIso(): string;
  /**
   * Operator mode switch — default true (require an explicit human
   * approval before any real order submission). Only the caller
   * (`run-rebalance.ts`'s `RS3M_REQUIRE_APPROVAL` env var) may set this
   * to false; the engine itself never decides to skip approval. See
   * `safety-guards.ts#assertApprovalGranted`.
   */
  requireApproval: boolean;
  /** Reads the approval marker for (decisionMonth, candidateHash) — see `approval-store.ts#hasValidApproval`. Only ever consulted; never written by the engine. */
  hasValidApproval(decisionMonth: string, candidateHash: string): Promise<boolean>;
  /** Injectable sleep for post-submission fill polling — defaults to a real timer. Tests pass a fake to stay instant. */
  sleep?: (ms: number) => Promise<void>;
  /** Max `getOrder` polls per freshly-submitted order while waiting for a terminal fill status. Default 5. */
  pollMaxAttempts?: number;
  /** Delay between polls, in ms. Default 1000. */
  pollDelayMs?: number;
}

export type Rs3mPlanBlockedReason =
  | "MALFORMED_DATA"
  | "INSUFFICIENT_DATA"
  | "ACCOUNT_UNAVAILABLE"
  | "POSITIONS_UNAVAILABLE"
  | "NO_REBALANCE_NEEDED"
  | "SAFETY_GUARD_FAILED"
  /** Every OTHER guard passed — this is the ONLY thing blocking real execution. Distinct from the generic SAFETY_GUARD_FAILED so callers can distinguish "ready and waiting on you" from "something is actually wrong." */
  | "AWAITING_APPROVAL";

export interface Rs3mPlanResult {
  signal: Rs3mSignal | undefined;
  plan: RebalancePlan | undefined;
  guardResult: SafetyGuardResult;
  wouldExecute: boolean;
  blockedReason?: Rs3mPlanBlockedReason;
  /** Account/positions snapshot as of THIS plan computation — `undefined` only when the corresponding read call itself failed (see `blockedReason`). Captured here (additive to the plan's own return shape) so callers building a forward-evidence record don't need a second, potentially-inconsistent read. */
  account?: AlpacaAccount;
  positionsBefore?: AlpacaPosition[];
}

export interface Rs3mExecuteResult {
  planResult: Rs3mPlanResult;
  ordersSubmitted: AlpacaOrder[];
  skipped: boolean;
  skipReason?: string;
  /** True if at least one submitted order (this run or a prior partial run) had not reached a terminal fill status by the end of polling — a legitimate PARTIAL_FILL/still-open condition, not a failure. */
  anyOrderStillInFlight?: boolean;
}

function tickerFor(market: Market): string {
  const config = getInstrumentConfig(market);
  return config.ok ? config.value.ticker : market;
}

export function createRs3mEngine(deps: Rs3mEngineDependencies) {
  async function computePlan(assets: readonly RelativeStrengthAssetInput[]): Promise<Rs3mPlanResult> {
    const malformed = validateAssetCandles(assets);
    if (malformed.length > 0) {
      return {
        signal: undefined,
        plan: undefined,
        guardResult: { passed: false, violations: malformed.map((v) => ({ guard: "MALFORMED_DATA", reason: `${v.market} @ ${v.timestamp}: ${v.reason}` })) },
        wouldExecute: false,
        blockedReason: "MALFORMED_DATA",
      };
    }

    const signal = computeCurrentRs3mSignal(assets, RS3M_CANDIDATE_V1.lookbackMonths);
    if (!signal) {
      return {
        signal: undefined,
        plan: undefined,
        guardResult: { passed: false, violations: [{ guard: "INSUFFICIENT_DATA", reason: `Fewer than ${RS3M_CANDIDATE_V1.lookbackMonths + 1} months of data available — cannot compute a signal yet.` }] },
        wouldExecute: false,
        blockedReason: "INSUFFICIENT_DATA",
      };
    }

    const [accountResult, positionsResult] = await Promise.all([deps.tradingClient.getAccount(), deps.tradingClient.getPositions()]);
    if (!accountResult.ok) {
      return { signal, plan: undefined, guardResult: { passed: false, violations: [{ guard: "ACCOUNT_UNAVAILABLE", reason: accountResult.error.message }] }, wouldExecute: false, blockedReason: "ACCOUNT_UNAVAILABLE" };
    }
    if (!positionsResult.ok) {
      return { signal, plan: undefined, guardResult: { passed: false, violations: [{ guard: "POSITIONS_UNAVAILABLE", reason: positionsResult.error.message }] }, wouldExecute: false, blockedReason: "POSITIONS_UNAVAILABLE" };
    }

    const universeSymbols = RS3M_CANDIDATE_V1.universe.map(tickerFor);
    const targetTicker = signal.selectedMarket ? tickerFor(signal.selectedMarket as Market) : undefined;

    const plan = planRebalance({
      currentPositions: positionsResult.value.map((p) => ({ symbol: p.symbol, marketValue: p.marketValue })),
      universeSymbols,
      targetAsset: targetTicker,
      totalPortfolioValue: accountResult.value.portfolioValue,
    });

    const alreadyExecuted = await deps.hasExecutedThisMonth(signal.decisionMonth);
    const candidateHash = computeCandidateHash(RS3M_CANDIDATE_V1);
    const approvalGranted = await deps.hasValidApproval(signal.decisionMonth, candidateHash);
    const currentlyHeldSymbols = new Set(
      positionsResult.value.filter((p) => universeSymbols.includes(p.symbol) && p.marketValue > 0).map((p) => p.symbol),
    );

    const guardResult = runAllRs3mSafetyGuards({
      orders: plan.orders,
      currentlyHeldSymbols,
      totalPortfolioValue: accountResult.value.portfolioValue,
      decisionMonth: signal.decisionMonth,
      alreadyExecutedThisMonth: alreadyExecuted,
      signalDataCutoffTimestamp: signal.dataCutoffTimestamp,
      nowIso: deps.nowIso(),
      candidateId: RS3M_CANDIDATE_V1.candidateId,
      candidateHash,
      requireApproval: deps.requireApproval,
      approvalGranted,
    });

    const wouldExecute = guardResult.passed && plan.isRebalanceNeeded;
    const onlyApprovalMissing = !wouldExecute && plan.isRebalanceNeeded && guardResult.violations.length === 1 && guardResult.violations[0].guard === "APPROVAL_REQUIRED";
    return {
      signal,
      plan,
      guardResult,
      wouldExecute,
      blockedReason: wouldExecute ? undefined : onlyApprovalMissing ? "AWAITING_APPROVAL" : !guardResult.passed ? "SAFETY_GUARD_FAILED" : "NO_REBALANCE_NEEDED",
      account: accountResult.value,
      positionsBefore: positionsResult.value,
    };
  }

  /** Computes the full plan WITHOUT ever calling any write endpoint — safe to run as many times as needed. */
  async function dryRun(assets: readonly RelativeStrengthAssetInput[]): Promise<Rs3mPlanResult> {
    return computePlan(assets);
  }

  /** Polls each order's status via `getOrder` until it reaches a terminal fill status (`isOrderStatusTerminal`) or the poll budget is exhausted — surfaces partial/still-open fills honestly rather than assuming an "accepted" response means "filled." */
  async function pollOrdersToTerminal(orders: readonly AlpacaOrder[]): Promise<{ orders: AlpacaOrder[]; anyStillInFlight: boolean }> {
    const maxAttempts = deps.pollMaxAttempts ?? 5;
    const delayMs = deps.pollDelayMs ?? 1000;
    const sleepFn = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

    const resolved: AlpacaOrder[] = [];
    let anyStillInFlight = false;

    for (const order of orders) {
      let current = order;
      for (let attempt = 0; !isOrderStatusTerminal(current.status) && attempt < maxAttempts; attempt++) {
        await sleepFn(delayMs);
        const polled = await deps.tradingClient.getOrder(current.orderId);
        if (!polled.ok) break;
        current = polled.value;
      }
      if (!isOrderStatusTerminal(current.status)) anyStillInFlight = true;
      resolved.push(current);
    }

    return { orders: resolved, anyStillInFlight };
  }

  /**
   * Submits real (paper) orders — ONLY when `dryRun`'s own plan would
   * execute. Before submitting anything, reconciles this month's planned
   * orders against the broker's ACTUAL order history by deterministic
   * `clientOrderId` (`order-idempotency.ts`): orders that already exist
   * there are never resubmitted (restart/retry safety), and a prior
   * terminally-failed attempt fails the whole run closed rather than
   * silently retrying under a new ID. Stops at the first NEW submission
   * failure and reports it rather than guessing at partial state. After
   * submission, polls each order to a terminal fill status before
   * returning.
   */
  async function execute(assets: readonly RelativeStrengthAssetInput[]): Promise<Rs3mExecuteResult> {
    const planResult = await computePlan(assets);
    if (!planResult.wouldExecute || !planResult.plan || !planResult.signal) {
      return { planResult, ordersSubmitted: [], skipped: true, skipReason: planResult.blockedReason ?? "NOT_EXECUTABLE" };
    }

    const existingOrdersResult = await deps.tradingClient.listOrders({ status: "all" });
    if (!existingOrdersResult.ok) {
      return { planResult, ordersSubmitted: [], skipped: true, skipReason: `Could not verify existing broker orders before submitting (fail-closed on idempotency check): ${existingOrdersResult.error.message}` };
    }

    const reconciliation = reconcileExistingOrdersForMonth(existingOrdersResult.value, planResult.signal.decisionMonth, planResult.plan.orders);

    if (reconciliation.failedPriorAttempts.length > 0) {
      const details = reconciliation.failedPriorAttempts.map((o) => `${o.symbol} ${o.side} (${o.status})`).join(", ");
      return { planResult, ordersSubmitted: [], skipped: true, skipReason: `A prior attempt this month failed terminally for: ${details}. Refusing to auto-retry under a new order ID — needs human review.` };
    }

    const submitted: AlpacaOrder[] = [...reconciliation.alreadySubmitted];
    for (const order of reconciliation.toSubmit) {
      const clientOrderId = buildClientOrderId(planResult.signal.decisionMonth, order.symbol, order.side);
      const result = await deps.tradingClient.submitNotionalOrder({ symbol: order.symbol, side: order.side, notionalUsd: order.notionalUsd, clientOrderId });
      if (!result.ok) {
        return { planResult, ordersSubmitted: submitted, skipped: true, skipReason: `Order submission failed for ${order.symbol} ${order.side}: ${result.error.message}` };
      }
      submitted.push(result.value);
    }

    const { orders: reconciledOrders, anyStillInFlight } = await pollOrdersToTerminal(submitted);

    return { planResult, ordersSubmitted: reconciledOrders, skipped: false, anyOrderStillInFlight: anyStillInFlight };
  }

  return { dryRun, execute };
}
