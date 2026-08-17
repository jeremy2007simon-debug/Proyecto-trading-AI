import type { RelativeStrengthAssetInput } from "@/core/backtesting/research/relative-strength";
import type { AlpacaOrder, AlpacaPaperTradingClient } from "@/core/execution/alpaca-paper-client";
import { getInstrumentConfig } from "@/core/market-data/instruments";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
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
 * `dryRun()` NEVER calls `submitNotionalOrder` — only the two read-only
 * calls (`getAccount`, `getPositions`) already used by every other
 * read-side script. `execute()` is the only path that submits real (paper)
 * orders, and only proceeds when `dryRun()`'s own guard result would have
 * passed — "si cualquier safeguard falla: NO OPERAR."
 */

export interface Rs3mEngineDependencies {
  tradingClient: AlpacaPaperTradingClient;
  /** Reads the idempotency marker for `decisionMonth` — see `safety-guards.ts`'s `assertNotAlreadyExecutedThisMonth`. */
  hasExecutedThisMonth(decisionMonth: string): Promise<boolean>;
  nowIso(): string;
}

export type Rs3mPlanBlockedReason =
  | "INSUFFICIENT_DATA"
  | "ACCOUNT_UNAVAILABLE"
  | "POSITIONS_UNAVAILABLE"
  | "NO_REBALANCE_NEEDED"
  | "SAFETY_GUARD_FAILED";

export interface Rs3mPlanResult {
  signal: Rs3mSignal | undefined;
  plan: RebalancePlan | undefined;
  guardResult: SafetyGuardResult;
  wouldExecute: boolean;
  blockedReason?: Rs3mPlanBlockedReason;
}

export interface Rs3mExecuteResult {
  planResult: Rs3mPlanResult;
  ordersSubmitted: AlpacaOrder[];
  skipped: boolean;
  skipReason?: string;
}

/** Deterministic, human-auditable idempotency key: one buy/sell per (decision month, symbol) pair can ever be submitted. */
export function buildClientOrderId(decisionMonth: string, symbol: string, side: "buy" | "sell"): string {
  return `rs3m-${decisionMonth}-${symbol.toLowerCase()}-${side}`;
}

function tickerFor(market: Market): string {
  const config = getInstrumentConfig(market);
  return config.ok ? config.value.ticker : market;
}

export function createRs3mEngine(deps: Rs3mEngineDependencies) {
  async function computePlan(assets: readonly RelativeStrengthAssetInput[]): Promise<Rs3mPlanResult> {
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
    });

    const wouldExecute = guardResult.passed && plan.isRebalanceNeeded;
    return {
      signal,
      plan,
      guardResult,
      wouldExecute,
      blockedReason: wouldExecute ? undefined : !guardResult.passed ? "SAFETY_GUARD_FAILED" : "NO_REBALANCE_NEEDED",
    };
  }

  /** Computes the full plan WITHOUT ever calling any write endpoint — safe to run as many times as needed. */
  async function dryRun(assets: readonly RelativeStrengthAssetInput[]): Promise<Rs3mPlanResult> {
    return computePlan(assets);
  }

  /** Submits real (paper) orders — ONLY when `dryRun`'s own plan would execute. Stops at the first failed order and reports it rather than guessing at partial state. */
  async function execute(assets: readonly RelativeStrengthAssetInput[]): Promise<Rs3mExecuteResult> {
    const planResult = await computePlan(assets);
    if (!planResult.wouldExecute || !planResult.plan || !planResult.signal) {
      return { planResult, ordersSubmitted: [], skipped: true, skipReason: planResult.blockedReason ?? "NOT_EXECUTABLE" };
    }

    const submitted: AlpacaOrder[] = [];
    for (const order of planResult.plan.orders) {
      const clientOrderId = buildClientOrderId(planResult.signal.decisionMonth, order.symbol, order.side);
      const result = await deps.tradingClient.submitNotionalOrder({ symbol: order.symbol, side: order.side, notionalUsd: order.notionalUsd, clientOrderId });
      if (!result.ok) {
        return { planResult, ordersSubmitted: submitted, skipped: true, skipReason: `Order submission failed for ${order.symbol} ${order.side}: ${result.error.message}` };
      }
      submitted.push(result.value);
    }

    return { planResult, ordersSubmitted: submitted, skipped: false };
  }

  return { dryRun, execute };
}
