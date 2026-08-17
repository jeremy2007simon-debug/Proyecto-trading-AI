import { canonicalJson, fnv1a } from "@/core/backtesting/research/experiment-registry";
import type { Market } from "@/core/shared/types";

/**
 * Block 6 — Candidate Verification & Paper Trading.
 *
 * The Block 5 Strategy Discovery & Validation Engine produced exactly one
 * CANDIDATE: a 3-month-lookback monthly rotation among SPY/QQQ/IWM/DIA
 * (`docs/BLOCK5_STRATEGY_DISCOVERY_REPORT.md` §10). This file is the
 * IMMUTABLE, VERSIONED definition of that candidate. Per the Block 6
 * spec: no parameter here may ever be edited in place. Any future change
 * (lookback, universe, rebalance frequency, weighting, execution
 * assumptions, cost model, price adjustment) must be published as a NEW
 * export (`RS3M_CANDIDATE_V2`, ...) — never a mutation of `RS3M_CANDIDATE_V1`.
 * `tests/core/paper-trading/rs3m/candidate.test.ts` pins this candidate's
 * hash to a literal expected value specifically to make an in-place edit
 * fail loudly.
 *
 * `gitCommit`/`frozenAt` are deliberately NOT part of this definition (and
 * therefore not part of its hash): a candidate's identity is its
 * STRATEGY DEFINITION, which must hash identically regardless of which
 * commit or checkout computes it. The commit/timestamp at which this
 * candidate was actually frozen is recorded once, separately, by the
 * freeze script into `results/block6/candidate/rs3m-v1-status.json` (see
 * `scripts/block6/audit-rotation-engine.ts`).
 */
export interface FrozenCandidateDefinition {
  readonly candidateId: string;
  readonly version: number;
  /** Trailing months of total return used to rank the universe at each rebalance. */
  readonly lookbackMonths: number;
  /** Logical markets in the rotation universe — SPY/QQQ/IWM/DIA via `INSTRUMENT_CONFIGS`. */
  readonly universe: readonly Market[];
  readonly rebalanceFrequency: "MONTHLY";
  /** 100% of capital in the single best-ranked asset — never a blend, never leveraged. */
  readonly weighting: "SINGLE_WINNER_100PCT";
  /** The exact data-cutoff -> signal -> order -> execution convention — see the Block 6 report §4 for the full audit of this assumption. */
  readonly executionAssumptions: string;
  /** Reference round-trip rebalance cost (bps of notional), audited in Block 6 Fase 12 — a documented reference point, not a live-tuned parameter. */
  readonly referenceRebalanceCostBps: number;
  /** Alpaca `adjustment` query parameter — fixed to "all" (splits + dividends) for this candidate; see the Block 6 report §3 for why Block 5's original result used Alpaca's unstated raw default. */
  readonly priceAdjustment: "raw" | "split" | "dividend" | "all";
  /** Earliest date candles are requested from when computing this candidate's signal/backtest. */
  readonly datasetFrom: string;
}

export const RS3M_CANDIDATE_V1: FrozenCandidateDefinition = Object.freeze({
  candidateId: "RS3M_CANDIDATE_V1",
  version: 1,
  lookbackMonths: 3,
  universe: Object.freeze(["SP500", "NASDAQ100", "RUSSELL2000", "DOWJONES"] as const),
  rebalanceFrequency: "MONTHLY",
  weighting: "SINGLE_WINNER_100PCT",
  executionAssumptions:
    "Signal computed from the close of the last trading day of each calendar month, using only data up to and including that close. " +
    "The order is planned for execution at the OPEN of the next trading session following that close — never the same close that generated the signal, " +
    "which is a documented deviation from the Block 5 backtest's simplified same-close-fill assumption (see the Block 6 report Fase 2/18 audit).",
  referenceRebalanceCostBps: 20,
  priceAdjustment: "all",
  datasetFrom: "2016-01-01T00:00:00.000Z",
} satisfies FrozenCandidateDefinition);

/** Deterministic fingerprint of a candidate's STRATEGY DEFINITION only (never gitCommit/frozenAt — see the module doc comment). Reuses the same FNV-1a + canonical-JSON machinery Block 5's experiment registry already uses, rather than a second hashing implementation. */
export function computeCandidateHash(candidate: FrozenCandidateDefinition): string {
  return fnv1a(canonicalJson(candidate));
}
