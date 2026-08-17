/**
 * Block 6, Fase 21-23 — reconciles what the backtest/ledger EXPECTED for
 * a given rebalance month against what paper trading ACTUALLY did.
 *
 * Pure module, zero I/O — takes plain expected/realized records as input
 * (the caller reads the ledger CSV and the paper order JSON files). Only
 * ever tested with SYNTHETIC fixtures in this session: RS3M_CANDIDATE_V1
 * has not been paper-traded yet (see the Block 6 report's "paper trading
 * duration" section) — there is no real forward data to reconcile against
 * yet. This module exists so that once forward data DOES exist, the
 * reconciliation logic is already written and tested, not improvised
 * later against real numbers.
 */

export interface ExpectedRebalance {
  decisionMonth: string;
  expectedAsset: string | undefined;
  /** The theoretical execution price the backtest/ledger assumed — the next trading session's real open, per RS3M_CANDIDATE_V1's execution convention. */
  expectedExecutionPrice: number | undefined;
  expectedNotionalUsd: number | undefined;
}

export interface RealizedRebalance {
  decisionMonth: string;
  realizedAsset: string | undefined;
  realizedFillPrice: number | undefined;
  realizedNotionalUsd: number | undefined;
  filledQty: number | undefined;
  orderStatus: string;
}

export interface ReconciliationResult {
  decisionMonth: string;
  /** `undefined` when either side has no data for this month at all (never fabricated as a match/mismatch). */
  assetMatch: boolean | undefined;
  /** (realized - expected) / expected, as a percentage — positive means the paper fill was WORSE (higher for a buy) than the theoretical price. `undefined` if either price is missing. */
  executionPriceDeltaPct: number | undefined;
  /** Dollar difference between the realized and expected notional. `undefined` if either is missing. */
  notionalDeltaUsd: number | undefined;
  fullyFilled: boolean;
  notes: string[];
}

function pctDelta(expected: number, realized: number): number | undefined {
  if (expected === 0) return undefined;
  return ((realized - expected) / expected) * 100;
}

/** Reconciles ONE month's expected vs realized rebalance. Missing data on either side is reported as `undefined`, never guessed. */
export function reconcileRebalance(expected: ExpectedRebalance | undefined, realized: RealizedRebalance | undefined): ReconciliationResult {
  const decisionMonth = expected?.decisionMonth ?? realized?.decisionMonth ?? "UNKNOWN";
  const notes: string[] = [];

  if (!expected) notes.push("No expected (backtest/ledger) record found for this month.");
  if (!realized) notes.push("No realized (paper order) record found for this month.");

  const assetMatch = expected && realized ? expected.expectedAsset === realized.realizedAsset : undefined;
  if (assetMatch === false) notes.push(`Asset mismatch: expected ${expected!.expectedAsset ?? "CASH"}, realized ${realized!.realizedAsset ?? "CASH"}.`);

  const executionPriceDeltaPct =
    expected?.expectedExecutionPrice !== undefined && realized?.realizedFillPrice !== undefined
      ? pctDelta(expected.expectedExecutionPrice, realized.realizedFillPrice)
      : undefined;

  const notionalDeltaUsd =
    expected?.expectedNotionalUsd !== undefined && realized?.realizedNotionalUsd !== undefined ? realized.realizedNotionalUsd - expected.expectedNotionalUsd : undefined;

  const fullyFilled = realized?.orderStatus === "filled";
  if (realized && !fullyFilled) notes.push(`Order status is "${realized.orderStatus}", not fully filled.`);

  return { decisionMonth, assetMatch, executionPriceDeltaPct, notionalDeltaUsd, fullyFilled, notes };
}

/** Reconciles every month present on EITHER side (expected or realized) — a realized month with no expected counterpart (or vice versa) is still reported, never silently dropped. */
export function reconcileAll(expectedList: readonly ExpectedRebalance[], realizedList: readonly RealizedRebalance[]): ReconciliationResult[] {
  const expectedByMonth = new Map(expectedList.map((e) => [e.decisionMonth, e]));
  const realizedByMonth = new Map(realizedList.map((r) => [r.decisionMonth, r]));
  const allMonths = new Set([...expectedByMonth.keys(), ...realizedByMonth.keys()]);

  return [...allMonths].sort().map((month) => reconcileRebalance(expectedByMonth.get(month), realizedByMonth.get(month)));
}
