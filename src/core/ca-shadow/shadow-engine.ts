import { SWING_ROUND_TRIP_BPS } from "@/core/us-index-research/cost-model";
import { evaluateCanonicalCaSignal, type CanonicalCaSignalPoint, type CanonicalCaSignalResult } from "@/core/ca-shadow/canonical-signal";
import { CA_CANDIDATE_V1, EXPECTED_CA_CANDIDATE_V1_HASH, computeCaCandidateHash } from "@/core/ca-shadow/candidate";
import { runCaShadowSafetyGuards, type CaShadowGuardResult } from "@/core/ca-shadow/safety-guards";

/**
 * Block 10 §6 — CA Shadow Engine. Pure pipeline:
 *
 *   market data -> canonical signal -> execution assumption ->
 *   hypothetical fill -> shadow position -> shadow P&L -> forward evidence
 *
 * ZERO order-submission capability: this file imports NOTHING from
 * `@/core/execution/alpaca-paper-client` (the only module in this
 * codebase that can submit an order) or any broker write path. It does
 * not even know such a thing exists — `tests/core/ca-shadow/no-broker-
 * writes.test.ts` statically asserts this file's own source text
 * contains no reference to that module.
 *
 * ZERO I/O (matches `rs3m-engine.ts`'s own convention): candles, prior
 * shadow state, and "now" are all injected as plain values; the caller
 * (the shadow Routine script) does the actual data fetch and evidence
 * persistence.
 *
 * EXECUTION TIMING (§10, frozen, matches `short-term-reversal.ts`'s own
 * convention exactly): the signal for "today" is evaluated from data
 * ending at today's own close (today = the most recently closed bar). If
 * triggered and currently FLAT, the hypothetical entry is booked AT
 * TODAY'S CLOSE — the position captures NO price return on its own entry
 * day (we could not have entered before the close that generates the
 * signal). If currently LONG (entered on the prior trading day), the
 * position is closed AT TODAY'S CLOSE and that day's full close-to-close
 * return is realized — this is the ONLY day a C-A shadow trade shows a
 * non-zero price P&L, exactly reproducing the original backtest's
 * single-row-per-trade economics when the entry and exit days are summed
 * together.
 */

export type ShadowPositionState = "FLAT" | "LONG";

export interface ShadowPriorState {
  position: ShadowPositionState;
  entryPrice: number | undefined;
  entryDate: string | undefined;
  shadowEquity: number; // multiplier, starts at 1.0
  lastProcessedDate: string | undefined; // idempotency: the caller must never re-process this date
}

export const INITIAL_SHADOW_STATE: ShadowPriorState = { position: "FLAT", entryPrice: undefined, entryDate: undefined, shadowEquity: 1, lastProcessedDate: undefined };

/** §9/§14 — the adjustment convention C-A was actually verified under (split+dividend-adjusted close). Declared here, not imported from the data-provider layer, so it stays a fixed tripwire even if the provider's own labeling changes. */
export const EXPECTED_CA_DATA_ADJUSTMENT = "SPLIT_AND_DIVIDEND_ADJUSTED_CLOSE";

export type ShadowDecision = "ENTER" | "EXIT" | "HOLD_FLAT" | "HOLD_LONG_NO_ACTION" | "BLOCKED";

export interface ShadowDayResult {
  date: string;
  candidateId: string;
  candidateHash: string;
  dataCutoff: string;
  dataSource: string;
  signal: CanonicalCaSignalResult | undefined;
  guardResult: CaShadowGuardResult;
  decision: ShadowDecision;
  theoreticalPrice: number | undefined;
  hypotheticalFillPrice: number | undefined;
  slippageAssumption: string;
  costBps: number;
  costFraction: number;
  positionBefore: ShadowPositionState;
  positionAfter: ShadowPositionState;
  /** Carried alongside `positionAfter` so `evidence-store.ts#readLastShadowState` can reconstruct `ShadowPriorState` from the evidence ledger alone — no separate mutable state file (§21: never duplicate what can be read from its source). */
  entryPriceAfter: number | undefined;
  entryDateAfter: string | undefined;
  dailyPnlPct: number; // fraction, e.g. 0.012 = +1.2%
  shadowEquityBefore: number;
  shadowEquityAfter: number;
  spyBenchmarkClose: number | undefined;
  dataAdjustment: string;
  warnings: string[];
}

export interface EvaluateShadowDayParams {
  points: readonly CanonicalCaSignalPoint[]; // chronological, ending at (and including) today's close
  priorState: ShadowPriorState;
  nowIso: string;
  dataSource: string;
  dataCutoffIso: string;
  dataAdjustment: string;
  candidateHashOverride?: string; // test-only hook to simulate tamper
}

const COST_SCENARIO = "REALISTIC" as const; // Block 9.y's own verified scenario — never changed to flatter forward performance (§11, §22)

export interface EvaluateShadowDayResult {
  dayResult: ShadowDayResult;
  newState: ShadowPriorState;
}

export function evaluateShadowDay(params: EvaluateShadowDayParams): EvaluateShadowDayResult {
  const { points, priorState, nowIso, dataSource, dataCutoffIso, dataAdjustment } = params;
  const today = points.at(-1);
  const todayDate = today?.date;
  const candidateHash = params.candidateHashOverride ?? computeCaCandidateHash(CA_CANDIDATE_V1);
  const warnings: string[] = [];

  const signal = points.length >= 2 ? evaluateCanonicalCaSignal(points, 252, 0.1) : undefined;

  const guardResult = runCaShadowSafetyGuards({
    candidateId: CA_CANDIDATE_V1.candidateId,
    candidateHash,
    expectedCandidateHash: EXPECTED_CA_CANDIDATE_V1_HASH,
    todayDate,
    lastProcessedDate: priorState.lastProcessedDate,
    dataCutoffIso,
    nowIso,
    signal,
    latestClose: today?.close,
    dataAdjustment,
    expectedAdjustment: EXPECTED_CA_DATA_ADJUSTMENT,
  });

  const costBps = SWING_ROUND_TRIP_BPS[COST_SCENARIO];
  const costFraction = costBps / 10_000;

  if (!guardResult.passed || !todayDate || !signal) {
    return {
      dayResult: {
        date: todayDate ?? "unknown",
        candidateId: CA_CANDIDATE_V1.candidateId,
        candidateHash,
        dataCutoff: dataCutoffIso,
        dataSource,
        signal,
        guardResult,
        decision: "BLOCKED",
        theoreticalPrice: today?.close,
        hypotheticalFillPrice: undefined,
        slippageAssumption: "N/A — blocked before any hypothetical fill was considered.",
        costBps,
        costFraction,
        positionBefore: priorState.position,
        positionAfter: priorState.position, // BLOCKED never updates position, per §14: "si falla: no actualizar posición"
        entryPriceAfter: priorState.entryPrice,
        entryDateAfter: priorState.entryDate,
        dailyPnlPct: 0,
        shadowEquityBefore: priorState.shadowEquity,
        shadowEquityAfter: priorState.shadowEquity,
        spyBenchmarkClose: today?.close,
        dataAdjustment,
        warnings: [...warnings, "SHADOW_BLOCKED", ...guardResult.violations.map((v) => `${v.guard}: ${v.reason}`)],
      },
      newState: priorState, // position/equity unchanged on a block
    };
  }

  const referencePrice = today!.close;
  // Same-close hypothetical fill — matches the VERIFIED backtest's own convention exactly (no new slippage model introduced to flatter or worsen forward performance, per §11/§22).
  const hypotheticalFillPrice = referencePrice;
  const slippageAssumption = "0 — reference price = hypothetical fill price, matching C-A's verified backtest convention exactly (round-trip friction is modeled entirely as SWING_ROUND_TRIP_BPS notional cost, not a separate price-slippage component).";

  let decision: ShadowDecision;
  let dailyPnlPct = 0;
  let positionAfter: ShadowPositionState = priorState.position;
  let newEntryPrice = priorState.entryPrice;
  let newEntryDate = priorState.entryDate;

  if (priorState.position === "LONG") {
    // Exit today, unconditionally — C-A's frozen spec is always exactly a 1-trading-day hold (§4 of the pre-registration / Block 9.y spec).
    const entryPrice = priorState.entryPrice!;
    dailyPnlPct = referencePrice / entryPrice - 1;
    positionAfter = "FLAT";
    newEntryPrice = undefined;
    newEntryDate = undefined;
    decision = "EXIT";
  } else if (signal.triggered) {
    // Enter today, at today's close — no price P&L captured on the entry day itself; cost charged upfront.
    dailyPnlPct = -costFraction;
    positionAfter = "LONG";
    newEntryPrice = referencePrice;
    newEntryDate = todayDate;
    decision = "ENTER";
  } else {
    decision = "HOLD_FLAT";
  }

  const shadowEquityAfter = priorState.shadowEquity * (1 + dailyPnlPct);

  return {
    dayResult: {
      date: todayDate,
      candidateId: CA_CANDIDATE_V1.candidateId,
      candidateHash,
      dataCutoff: dataCutoffIso,
      dataSource,
      signal,
      guardResult,
      decision,
      theoreticalPrice: referencePrice,
      hypotheticalFillPrice,
      slippageAssumption,
      costBps,
      costFraction,
      positionBefore: priorState.position,
      positionAfter,
      entryPriceAfter: newEntryPrice,
      entryDateAfter: newEntryDate,
      dailyPnlPct,
      shadowEquityBefore: priorState.shadowEquity,
      shadowEquityAfter,
      spyBenchmarkClose: referencePrice,
      dataAdjustment,
      warnings,
    },
    newState: { position: positionAfter, entryPrice: newEntryPrice, entryDate: newEntryDate, shadowEquity: shadowEquityAfter, lastProcessedDate: todayDate },
  };
}
