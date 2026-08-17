/**
 * Block 6, Fase 16 — turns an RS3M signal + current broker positions into
 * a concrete order plan. No I/O — takes already-fetched account/position
 * state as plain input (the caller, `rs3m-engine.ts`, is what actually
 * calls the Alpaca client).
 *
 * SINGLE_WINNER_100PCT model only: at most ONE ticker is ever held, and
 * the target notional for a buy is the account's FULL portfolio value —
 * there is no partial-position or multi-asset weighting concept here
 * (matches `RS3M_CANDIDATE_V1.weighting`).
 *
 * Known, documented simplification: the buy order's notional is sized off
 * the CURRENT total portfolio value even when a sell of the prior holding
 * is also being planned in the same rebalance — this assumes the paper
 * account's buying power reflects the full portfolio value immediately
 * (true for Alpaca's margin/day-trading buying power in practice, which
 * paper accounts default to), not literally waiting for T+1 cash
 * settlement. Documented here rather than silently assumed; a real T+2
 * cash-account settlement edge case would need to shrink the buy notional
 * or sequence the two orders — out of scope while paper trading isn't
 * actively submitting real orders this session (see Block 6 report).
 */

export interface CurrentPosition {
  symbol: string;
  marketValue: number;
}

export interface RebalancePlanOrder {
  symbol: string;
  side: "buy" | "sell";
  notionalUsd: number;
  reason: string;
}

export interface RebalancePlan {
  /** The single ticker currently held from the RS3M universe, if any (positions outside the universe are ignored — this plan never touches them). */
  currentAsset: string | undefined;
  /** The ticker the signal says to hold — `undefined` means "hold cash" (no eligible asset had enough history). */
  targetAsset: string | undefined;
  isRebalanceNeeded: boolean;
  orders: RebalancePlanOrder[];
  /** % of total portfolio value that would change hands this rebalance — 0 if no rebalance, 100 if a full switch or the very first position. */
  estimatedTurnoverPct: number;
}

export interface PlanRebalanceParams {
  currentPositions: readonly CurrentPosition[];
  /** The RS3M universe tickers (SPY/QQQ/IWM/DIA) — positions in any other symbol are ignored (out of this strategy's scope, never touched). */
  universeSymbols: readonly string[];
  targetAsset: string | undefined;
  totalPortfolioValue: number;
}

export function planRebalance(params: PlanRebalanceParams): RebalancePlan {
  const universeSet = new Set(params.universeSymbols);
  const heldUniversePositions = params.currentPositions.filter((p) => universeSet.has(p.symbol) && p.marketValue > 0);
  const currentAsset = heldUniversePositions[0]?.symbol;

  const isRebalanceNeeded = currentAsset !== params.targetAsset;
  const orders: RebalancePlanOrder[] = [];

  if (!isRebalanceNeeded) {
    return { currentAsset, targetAsset: params.targetAsset, isRebalanceNeeded: false, orders: [], estimatedTurnoverPct: 0 };
  }

  for (const position of heldUniversePositions) {
    orders.push({ symbol: position.symbol, side: "sell", notionalUsd: position.marketValue, reason: `No longer the top-ranked asset (was ${position.symbol}, target is ${params.targetAsset ?? "CASH"}).` });
  }

  if (params.targetAsset !== undefined) {
    orders.push({ symbol: params.targetAsset, side: "buy", notionalUsd: params.totalPortfolioValue, reason: `Top-ranked asset for this rebalance (RS3M_CANDIDATE_V1, single-winner 100%).` });
  }

  return {
    currentAsset,
    targetAsset: params.targetAsset,
    isRebalanceNeeded: true,
    orders,
    estimatedTurnoverPct: 100,
  };
}
