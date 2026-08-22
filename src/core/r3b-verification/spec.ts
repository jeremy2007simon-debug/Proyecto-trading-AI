import { canonicalJson, fnv1a } from "@/core/backtesting/research/experiment-registry";

/**
 * Block 8.4 — the FROZEN, exact-as-implemented specification of R3-B
 * (Block 8.3's sole surviving candidate), extracted from the ORIGINAL
 * implementation (`src/core/us-index-research/trend-pullback.ts` +
 * `regime.ts` + its experiment config in
 * `scripts/research/us-index/run-block8-3-funnel.ts`) BEFORE any
 * adversarial/reproduction work in this block began.
 *
 * This is a DOCUMENTATION artifact, not a new candidate definition — it
 * intentionally reuses `canonicalJson`/`fnv1a` (generic hashing infra,
 * already used by `RS3M_CANDIDATE_V1`'s own freeze) so this spec's hash
 * is computed the SAME deterministic way, but it does NOT import or
 * reference R3-B's own strategy code — the fields below are transcribed
 * by hand from reading that code, exactly the "extract and document
 * formally" step §2 of this block's brief requires, before any
 * reproduction or adversarial test touches it. Per §0's explicit
 * prohibition, none of R3-B's actual parameters are changed here or
 * anywhere else in this block.
 */
export interface R3bFrozenSpec {
  readonly candidateUnderVerification: "R3-B";
  readonly sourceBlock: "8.3";
  readonly sourceFiles: readonly string[];
  readonly market: "SPY";
  readonly timeframe: "1D";

  // --- Trend signal ---
  readonly smaTrendPeriod: number;
  readonly smaSlopeLookbackDays: number;
  /** TrendSignal = true iff SMA(smaTrendPeriod) today > SMA(smaTrendPeriod) `smaSlopeLookbackDays` trading days ago. */
  readonly trendDefinition: string;

  // --- Regime filter ---
  readonly regimeFilterMode: "LONG_TERM_TREND";
  readonly regimeLongTermTrendSmaPeriod: number;
  /** Regime = bullish iff close > SMA(regimeLongTermTrendSmaPeriod). A SEPARATE SMA from the trend signal's own smaTrendPeriod (200 vs 50) — two different SMA windows are computed. */
  readonly regimeDefinition: string;
  /** Verbatim behavior of `regimePasses()`: passes (never blocks) when there is no regime reading yet (warmup) — NOT a fail-closed default. This means the regime filter is a soft no-op for the first ~273 trading days of any dataset (the realized-vol rolling-percentile's own 21+252-day warmup), even in LONG_TERM_TREND mode, until the regime engine's warmup completes — only the SEPARATE 50/10-day trend-signal warmup (~60 days) gates entries before that point. */
  readonly regimeWarmupBehavior: string;

  // --- Pullback entry ---
  readonly rsiPeriod: number;
  readonly entryRsiThreshold: number;
  readonly exitRsiThreshold: number;
  /** Entry = true iff (a) prior-day RSI(rsiPeriod) < entryRsiThreshold TWO days before decision (index i-2), AND (b) prior-day RSI(rsiPeriod) >= entryRsiThreshold ONE day before decision (index i-1) — i.e. RSI crossed UP through entryRsiThreshold between i-2 and i-1 — AND (c) TrendSignal true at i-1 AND (d) regime passes at i-1. */
  readonly entryDefinition: string;

  // --- Exit ---
  readonly maxHoldDays: number;
  /** Exit = true iff, at i-1 (while in position): RSI(rsiPeriod) >= exitRsiThreshold, OR TrendSignal turns false (SMA no longer rising), OR daysHeld >= maxHoldDays. */
  readonly exitDefinition: string;

  // --- Sizing / cash ---
  readonly sizing: "binary 0% or 100% of capital — never partial, never leveraged, never short";
  readonly cashBehavior: "0% return while flat (position flag = 0) — synthetic cash, no interest accrued or deducted";

  // --- Timing / execution convention ---
  readonly signalTimingConvention: string;
  readonly executionAssumption: string;

  // --- Data ---
  readonly dataProvider: "yahoo";
  readonly priceSeriesUsed: "adjClose (dividend + split adjusted) exclusively for returns; open/high/low scaled by the same per-bar adjClose/close ratio for indicator inputs (toAdjustedCandles)";
  readonly datasetFrom: "no explicit floor — full available SPY daily history from this session's fetched dataset (1993-01-29 onward)";
  readonly datasetTo: "2026-08-21 (this session's fetch date)";

  // --- Cost ---
  readonly costScenarioAudited: "REALISTIC";
  readonly costConvention: string;
  readonly costBpsRealistic: number;

  // --- Classification thresholds it was promoted under (Block 8.3) ---
  readonly promotionCriteria: string;
}

export const R3B_FROZEN_SPEC: R3bFrozenSpec = Object.freeze({
  candidateUnderVerification: "R3-B",
  sourceBlock: "8.3",
  sourceFiles: Object.freeze([
    "src/core/us-index-research/trend-pullback.ts",
    "src/core/us-index-research/regime.ts",
    "scripts/research/us-index/run-block8-3-funnel.ts (R3-B config)",
  ]),
  market: "SPY",
  timeframe: "1D",

  smaTrendPeriod: 50,
  smaSlopeLookbackDays: 10,
  trendDefinition: "TrendSignal(t) = SMA50(t) > SMA50(t - 10 trading bars)",

  regimeFilterMode: "LONG_TERM_TREND",
  regimeLongTermTrendSmaPeriod: 200,
  regimeDefinition: "Regime(t) bullish iff adjClose(t) > SMA200(t)",
  regimeWarmupBehavior:
    "regimePasses() returns true (passes) whenever byDate has no entry for that date — true both before SMA200 warms up (200 bars) AND before the realized-vol rolling percentile warms up (realized-vol(20) needs 21 bars, then a 252-bar percentile window on top = 273 bars total) — the LATER of the two, since buildRegimeSeries only writes a byDate entry once BOTH sma and pctile are defined. So LONG_TERM_TREND is a soft no-op for the first ~273 trading days of the dataset even though it only reads the SMA200 field.",

  rsiPeriod: 14,
  entryRsiThreshold: 40,
  exitRsiThreshold: 55,
  entryDefinition:
    "Not-in-position at day i: enter (position becomes true, applied to day i's return) iff RSI14(i-2) < 40 AND RSI14(i-1) >= 40 AND TrendSignal(i-1) === true AND RegimePasses(i-1) === true. (i-1 = 'prior', the day whose close is known before day i's own return realizes.)",

  maxHoldDays: 20,
  exitDefinition:
    "In-position at day i: exit (position becomes false, applied to day i's return) iff RSI14(i-1) >= 55, OR TrendSignal(i-1) === false, OR daysHeld >= 20 (days held counted from the day AFTER entry).",

  sizing: "binary 0% or 100% of capital — never partial, never leveraged, never short",
  cashBehavior: "0% return while flat (position flag = 0) — synthetic cash, no interest accrued or deducted",

  signalTimingConvention:
    "One-day lag by construction: the position flag applied to day i's realized return (close(i-1) -> close(i)) is decided ENTIRELY from indicator/regime readings as of day i-1's close (never day i's own reading). Economically equivalent to: signal computed at close(i-1), position effectively held from close(i-1) to close(i) — i.e. a close(t-1)-decision / close(t-1)-to-close(t)-holding convention, NOT a next-OPEN execution convention (unlike RS3M_CANDIDATE_V1's own monthly rebalance, which explicitly fills at the NEXT SESSION'S OPEN, a deliberately different, more conservative convention — see candidate.ts's executionAssumptions).",
  executionAssumption:
    "Same-day-close fill, one-day-lagged decision: this is the SAME simplified same-close-fill assumption Block 5's original relative-strength backtest used (before Block 6 moved RS3M itself to a more conservative next-open convention) — R3-B was never audited for this next-open-vs-same-close execution-timing sensitivity before Block 8.3 promoted it. This block's §7 (execution timing) directly tests that sensitivity.",

  dataProvider: "yahoo",
  priceSeriesUsed: "adjClose (dividend + split adjusted) exclusively for returns; open/high/low scaled by the same per-bar adjClose/close ratio for indicator inputs (toAdjustedCandles)",
  datasetFrom: "no explicit floor — full available SPY daily history from this session's fetched dataset (1993-01-29 onward)",
  datasetTo: "2026-08-21 (this session's fetch date)",

  costScenarioAudited: "REALISTIC",
  costConvention:
    "swingTurnoverCost(turnover, 'REALISTIC') = |turnover| * (SWING_ROUND_TRIP_BPS.REALISTIC / 10000), charged EVERY day turnover != 0 — i.e. on BOTH the entry day (turnover 0->1) AND the exit day (turnover 1->0) independently, each charged the FULL 'round trip' bps figure. Despite the constant's name, a complete enter+exit cycle therefore costs 2x SWING_ROUND_TRIP_BPS.REALISTIC, not 1x — a naming/documentation inconsistency flagged by this audit (§8), not a computational bug: costs were conservatively OVER-charged relative to the '3bps round trip' label, not under-charged.",
  costBpsRealistic: 3,

  promotionCriteria:
    "Block 8.3 mechanical classifyStrategy CANDIDATE gate (positive full-period/OOS/majority-walk-forward/sufficient sample) PLUS the post-funnel review script's two override criteria: Deflated Sharpe Ratio >= 0.5 (24-trial daily-family pool) AND correlation vs RS3M classified HIGH diversification value (|corr| < 0.3).",
} satisfies R3bFrozenSpec);

export function computeR3bSpecHash(spec: R3bFrozenSpec): string {
  return fnv1a(canonicalJson(spec));
}
