import { getAlpacaPaperTradingBaseUrl } from "@/core/execution/alpaca-paper-client";
import type { RebalancePlanOrder } from "@/core/paper-trading/rs3m/rebalance-planner";

/**
 * Block 6, Fase 17 — exhaustive, additive safety guards for the RS3M
 * paper-trading path. Per the Block 6 spec: "Si cualquier safeguard
 * falla: NO OPERAR." Every guard below returns `undefined` when it
 * passes and a `SafetyGuardViolation` when it fails — `runAllRs3mSafetyGuards`
 * collects ALL violations (never short-circuits on the first one) so a
 * dry-run report can show everything wrong at once, then requires ALL of
 * them to pass before `rs3m-engine.ts` will submit a single order.
 *
 * No I/O here: the paper-only base-URL check reads a pure getter from
 * `alpaca-paper-client.ts` (no network call); idempotency/staleness take
 * their inputs as plain values — the actual file-existence check for
 * "already executed this month" lives in the script/engine layer that
 * calls this module, matching the "core has zero I/O" convention used
 * everywhere else in this codebase.
 */

export const RS3M_ALLOWED_SYMBOLS = ["SPY", "QQQ", "IWM", "DIA"] as const;
export type Rs3mAllowedSymbol = (typeof RS3M_ALLOWED_SYMBOLS)[number];

const EXPECTED_PAPER_BASE_URL = "https://paper-api.alpaca.markets/v2";
/** Small epsilon (dollars) to absorb float rounding — RS3M is single-winner 100%, never more than that, ever. */
const NO_LEVERAGE_EPSILON_USD = 0.5;

export interface SafetyGuardViolation {
  guard: string;
  reason: string;
}

export interface SafetyGuardResult {
  passed: boolean;
  violations: SafetyGuardViolation[];
}

/** Re-asserts, at runtime, that the trading client's base URL is EXACTLY the Alpaca PAPER endpoint — defense in depth on top of `alpaca-paper-client.ts`'s own structural guarantee (that file has no code path to anywhere else at all). */
export function assertPaperOnly(): SafetyGuardViolation | undefined {
  const baseUrl = getAlpacaPaperTradingBaseUrl();
  if (baseUrl !== EXPECTED_PAPER_BASE_URL) {
    return { guard: "PAPER_ONLY", reason: `Trading client base URL is "${baseUrl}", expected exactly "${EXPECTED_PAPER_BASE_URL}". Refusing to proceed.` };
  }
  return undefined;
}

export function assertSymbolWhitelisted(symbol: string): SafetyGuardViolation | undefined {
  if (!(RS3M_ALLOWED_SYMBOLS as readonly string[]).includes(symbol)) {
    return { guard: "SYMBOL_WHITELIST", reason: `Symbol "${symbol}" is not in the allowed RS3M universe (${RS3M_ALLOWED_SYMBOLS.join(", ")}).` };
  }
  return undefined;
}

/** A "sell" is only ever valid to CLOSE an existing long position — the single-winner, 100%-invested, no-stop-loss model has no shorting concept at all. A sell with nothing currently held would open a short, which is forbidden. */
export function assertNoShortOrder(order: RebalancePlanOrder, currentlyHeldSymbols: ReadonlySet<string>): SafetyGuardViolation | undefined {
  if (order.side === "sell" && !currentlyHeldSymbols.has(order.symbol)) {
    return { guard: "NO_SHORTS", reason: `Refusing to submit a sell order for "${order.symbol}" with no existing long position — RS3M never shorts.` };
  }
  return undefined;
}

/** RS3M is single-winner 100%-invested, never leveraged — a buy notional above the total portfolio value would require margin/leverage. */
export function assertNoLeverage(order: RebalancePlanOrder, totalPortfolioValue: number): SafetyGuardViolation | undefined {
  if (order.side === "buy" && order.notionalUsd > totalPortfolioValue + NO_LEVERAGE_EPSILON_USD) {
    return { guard: "NO_LEVERAGE", reason: `Order notional $${order.notionalUsd.toFixed(2)} for "${order.symbol}" exceeds total portfolio value $${totalPortfolioValue.toFixed(2)} — RS3M never uses leverage or margin.` };
  }
  return undefined;
}

/** Refuses to submit a duplicate rebalance for a decision month already marked executed — the caller supplies this from its own idempotency-marker read (see module doc comment). */
export function assertNotAlreadyExecutedThisMonth(decisionMonth: string, alreadyExecuted: boolean): SafetyGuardViolation | undefined {
  if (alreadyExecuted) {
    return { guard: "IDEMPOTENCY", reason: `A rebalance for ${decisionMonth} has already been executed — refusing to submit duplicate orders.` };
  }
  return undefined;
}

/** Refuses to act on a signal whose data cutoff is implausibly old (a stalled data feed) or in the future (a clock/data bug). */
export function assertSignalNotStale(signalDataCutoffTimestamp: string, nowIso: string, maxStaleDays = 10): SafetyGuardViolation | undefined {
  const ageMs = new Date(nowIso).getTime() - new Date(signalDataCutoffTimestamp).getTime();
  if (ageMs < 0) {
    return { guard: "STALE_SIGNAL", reason: `Signal data cutoff ${signalDataCutoffTimestamp} is AFTER "now" (${nowIso}) — refusing (this indicates a clock or data bug).` };
  }
  const maxAgeMs = maxStaleDays * 24 * 60 * 60 * 1000;
  if (ageMs > maxAgeMs) {
    return { guard: "STALE_SIGNAL", reason: `Signal data cutoff ${signalDataCutoffTimestamp} is more than ${maxStaleDays} days old relative to ${nowIso} — refusing to act on stale data.` };
  }
  return undefined;
}

export interface RunAllGuardsParams {
  orders: readonly RebalancePlanOrder[];
  currentlyHeldSymbols: ReadonlySet<string>;
  totalPortfolioValue: number;
  decisionMonth: string;
  alreadyExecutedThisMonth: boolean;
  signalDataCutoffTimestamp: string;
  nowIso: string;
  maxStaleDays?: number;
}

/** Runs every guard and collects ALL violations (never short-circuits) — "si cualquier safeguard falla: NO OPERAR." */
export function runAllRs3mSafetyGuards(params: RunAllGuardsParams): SafetyGuardResult {
  const violations: SafetyGuardViolation[] = [];

  const paperOnly = assertPaperOnly();
  if (paperOnly) violations.push(paperOnly);

  const idempotency = assertNotAlreadyExecutedThisMonth(params.decisionMonth, params.alreadyExecutedThisMonth);
  if (idempotency) violations.push(idempotency);

  const staleness = assertSignalNotStale(params.signalDataCutoffTimestamp, params.nowIso, params.maxStaleDays);
  if (staleness) violations.push(staleness);

  for (const order of params.orders) {
    const symbolCheck = assertSymbolWhitelisted(order.symbol);
    if (symbolCheck) violations.push(symbolCheck);

    const shortCheck = assertNoShortOrder(order, params.currentlyHeldSymbols);
    if (shortCheck) violations.push(shortCheck);

    const leverageCheck = assertNoLeverage(order, params.totalPortfolioValue);
    if (leverageCheck) violations.push(leverageCheck);
  }

  return { passed: violations.length === 0, violations };
}
