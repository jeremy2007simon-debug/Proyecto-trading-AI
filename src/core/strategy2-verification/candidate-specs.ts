import { canonicalJson, fnv1a } from "@/core/backtesting/research/experiment-registry";

/**
 * Block 9.y — frozen specifications for C-A and E-C, extracted by
 * hand-reading Block 9.x's ORIGINAL implementation
 * (`src/core/strategy2-research/short-term-reversal.ts`,
 * `volatility-risk-premium.ts`) and pre-registration
 * (`docs/BLOCK9_STRATEGY2_PREREGISTRATION.md` §4) BEFORE any
 * verification work in this block began. Same hashing convention as
 * `RS3M_CANDIDATE_V1`/R3-B (FNV-1a over canonical JSON). Frozen —
 * nothing below changes after verification starts; no parameter here
 * is ever "improved."
 */
export interface FrozenCandidateSpec {
  candidateId: string;
  signalDefinition: string;
  market: string;
  instrument: string;
  timeframe: string;
  entryTiming: string;
  exitTiming: string;
  positionSizing: string;
  stopLogic: string;
  costAssumptions: string;
  dataSource: string;
  parameterValues: Record<string, number | string>;
}

export const C_A_FROZEN_SPEC: FrozenCandidateSpec = {
  candidateId: "C-A",
  signalDefinition:
    "Time-series reversal: on day i, if day (i-1)'s close-to-close return is in the bottom decile of its own trailing 252-trading-day return distribution (the 252 returns ending at, and including, day i-1's own), go long for 1 trading day.",
  market: "SP500",
  instrument: "SPY",
  timeframe: "1D",
  entryTiming: "Enter at day (i-1)'s close (i.e., held from close(i-1) to close(i)) whenever the trigger condition, evaluated using only data known by close(i-1), fires.",
  exitTiming: "Exit at day i's close — always exactly 1 trading day held, unconditional, no early exit and no extension.",
  positionSizing: "Full notional (100% of allocated capital) when triggered, 0% otherwise. No leverage, no partial sizing.",
  stopLogic: "None — no stop-loss of any kind. Risk is bounded structurally by the 1-day-only holding period, not by an exit rule.",
  costAssumptions: "SWING_ROUND_TRIP_BPS (src/core/us-index-research/cost-model.ts): OPTIMISTIC 0bps, REALISTIC 3bps, STRESSED 10bps, charged once per triggered day (one full round trip).",
  dataSource: "Yahoo Finance daily OHLC + adjClose for SPY (query1.finance.yahoo.com/v8/finance/chart), full available history (1993-01-29 onward).",
  parameterValues: { lookbackDays: 252, decileThreshold: 0.1, holdDays: 1 },
};

export const E_C_FROZEN_SPEC: FrozenCandidateSpec = {
  candidateId: "E-C",
  signalDefinition:
    "Volatility risk premium harvesting: LONG SVXY (the short-VIX-futures ETP itself — long exposure IS the short-vol/VRP-harvesting trade), entered whenever the trailing-1-year VIX percentile (as of yesterday's close) is at or below its own median, with a hard -15% stop-loss checked against each day's LOW (worst point of the day for a long position).",
  market: "CBOE_VOLATILITY_COMPLEX",
  instrument: "SVXY",
  timeframe: "1D",
  entryTiming: "Enter fresh long at yesterday's close whenever flat AND the VIX-percentile filter is ON (evaluated using only VIX levels known by yesterday's close).",
  exitTiming: "Exit only on (a) a stop-loss breach (see stopLogic) or (b) the VIX-percentile filter turning OFF (evaluated at yesterday's close, applied to today, flat with no new position that day) — never a fixed holding period.",
  positionSizing: "Full notional (100% of allocated capital) when in position, 0% otherwise. No leverage beyond SVXY's own product structure, no partial sizing.",
  stopLogic:
    "Hard -15% stop from the position's own entry price, checked against each day's LOW. As originally implemented (Block 9.x): realized loss on a breach day is capped at exactly -15%, without modeling gap risk. Block 9.y's verification treats this cap as a KNOWN, DISCLOSED SIMPLIFICATION requiring independent stress-testing (see §11 of the verification report) — the frozen SPEC is the -15% trigger threshold and LOW-based breach detection, not the naive fill-price assumption, which is explicitly re-examined, not frozen as correct.",
  costAssumptions: "SWING_ROUND_TRIP_BPS (src/core/us-index-research/cost-model.ts): OPTIMISTIC 0bps, REALISTIC 3bps, STRESSED 10bps, charged once per entry/reopen event.",
  dataSource:
    "Yahoo Finance daily OHLC + adjClose for SVXY (query1.finance.yahoo.com/v8/finance/chart), available history 2011-10-04 onward (SVXY's own inception — a structural constraint, not a chosen window); FRED VIXCLS (free, keyless) for the VIX-percentile filter.",
  parameterValues: { stopLossPct: 0.15, vixPercentileFilterBelow: 0.5, vixLookbackDays: 252 },
};

export function computeCandidateSpecHash(spec: FrozenCandidateSpec): string {
  return fnv1a(canonicalJson(spec));
}

export const C_A_SPEC_HASH = computeCandidateSpecHash(C_A_FROZEN_SPEC);
export const E_C_SPEC_HASH = computeCandidateSpecHash(E_C_FROZEN_SPEC);
