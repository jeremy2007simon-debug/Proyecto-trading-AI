# R3-B — Frozen Specification (Block 8.4, pre-registration)

> Extracted by hand-reading the ORIGINAL Block 8.3 implementation (`src/core/us-index-research/trend-pullback.ts`, `regime.ts`, and R3-B's experiment config in `scripts/research/us-index/run-block8-3-funnel.ts`) BEFORE any reproduction or adversarial testing in Block 8.4 began. This document, and the machine-readable spec object it's transcribed from (`src/core/r3b-verification/spec.ts`), are frozen — nothing below changes after this point, and NOTHING in this document is a modification of R3-B's actual implementation (which remains completely untouched throughout Block 8.4, per its explicit prohibitions).

**Spec hash (FNV-1a over canonical JSON, same convention as `RS3M_CANDIDATE_V1`'s own hash):** `9c1f213e`

Reproducible via:
```
NODE_OPTIONS="--conditions=react-server" npx tsx -e "
import { R3B_FROZEN_SPEC, computeR3bSpecHash } from './src/core/r3b-verification/spec';
console.log(computeR3bSpecHash(R3B_FROZEN_SPEC));
"
```
Pinned by `tests/core/r3b-verification/spec.test.ts`.

## 1. Market & Timeframe
- **Market:** SPY (S&P 500 ETF proxy)
- **Timeframe:** 1D (daily bars)

## 2. Trend Signal
`TrendSignal(t) = SMA50(t) > SMA50(t − 10 trading bars)` — a simple 50-day moving average, compared to its own value 10 trading days earlier. "Rising" means strictly greater, not "rising or flat."

## 3. Regime Filter — `LONG_TERM_TREND` mode
`Regime(t)` bullish iff `adjClose(t) > SMA200(t)` — a SEPARATE 200-day SMA from the trend signal's own 50-day one. Two independent SMA windows are computed and compared to two different things (price vs. SMA200 for regime; SMA50 vs. its own past value for trend).

**Non-obvious warmup behavior (verbatim, as implemented):** `regimePasses()` returns `true` (i.e. does NOT block a trade) whenever no regime reading exists yet for that date. A regime reading only exists once BOTH the SMA200 AND the realized-vol rolling percentile have warmed up — the vol percentile needs realized-vol(20)'s own 21-bar warmup plus a 252-bar percentile window on top, i.e. **273 trading days**, which is LATER than SMA200's 200-day warmup. So even in `LONG_TERM_TREND` mode (which only reads the SMA200 field), the regime filter is a **soft no-op for the first ~273 trading days** of any dataset — trades in that window are gated only by the separate ~60-day trend-signal warmup, not by the regime filter. This is a real, previously-undocumented-at-this-level-of-precision behavior of the "as implemented" system, captured here exactly because an independent reproduction must either match it or explicitly diverge and report why.

## 4. Pullback Entry
Not in position at day `i`: enter (position becomes `true`, applied to day `i`'s own return) iff, at day `i−1` (the "prior" day whose close is fully known before day `i` happens):
- `RSI14(i−2) < 40` (was oversold two days before the decision day), AND
- `RSI14(i−1) ≥ 40` (has recovered back above 40 as of the decision day — a genuine cross-up, not just "RSI is currently ≥ 40"), AND
- `TrendSignal(i−1) === true`, AND
- `RegimePasses(i−1) === true`

## 5. Exit
In position at day `i`: exit (position becomes `false`, applied to day `i`'s own return) iff, at day `i−1`:
- `RSI14(i−1) ≥ 55` (take-profit-on-recovery), OR
- `TrendSignal(i−1) === false` (trend broke), OR
- `daysHeld ≥ 20` (time-stop; `daysHeld` counts from the day after entry)

## 6. Sizing & Cash
Binary 0% or 100% of capital — never partial, never leveraged, never short. While flat, realized return is exactly 0% (synthetic cash; no interest accrued or deducted).

## 7. Timing Convention — a genuine finding, not a restatement

The position flag applied to day `i`'s realized return (`close(i−1) → close(i)`) is decided ENTIRELY from indicator/regime readings as of day `i−1`'s close. This is a **one-day-lag, same-close-fill** convention: economically, the strategy behaves as though the signal is computed at `close(i−1)` and the position is held from that same close through `close(i)`.

**This is materially DIFFERENT from RS3M_CANDIDATE_V1's own execution convention**, which Block 6 deliberately made more conservative: RS3M's signal is computed at a month-end close, but the ORDER is planned for the OPEN of the NEXT trading session — never the same close that generated the signal (`candidate.ts`'s `executionAssumptions`, and Block 6 §2 of `docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md`, which explicitly calls the same-close-fill assumption "a documented DELIBERATE deviation" from Block 5's original, simplified backtest). **R3-B was never audited for this next-open-vs-same-close sensitivity before Block 8.3 promoted it to CANDIDATE** — closing this specific gap is one of this block's required audits (§7 of the Block 8.4 report).

## 8. Data
- **Provider:** Yahoo Finance (Alpaca confirmed unreachable in this environment — Block 8.3 §2.1).
- **Price series:** `adjClose` (dividend + split adjusted) exclusively for return computation; open/high/low scaled by the same per-bar `adjClose/close` ratio for indicator inputs (`toAdjustedCandles`).
- **Dataset window:** no explicit floor — the full available SPY daily history from this session's fetched dataset, 1993-01-29 through 2026-08-21.

## 9. Cost — a real naming/documentation finding

REALISTIC scenario: `swingTurnoverCost(turnover, "REALISTIC") = |turnover| × (3bps / 10,000)`, charged on EVERY day turnover is nonzero — i.e. independently on BOTH the entry day (turnover 0→1) AND the exit day (turnover 1→0), each charged the FULL "round trip" figure.

**Despite the constant's name (`SWING_ROUND_TRIP_BPS`), a complete enter-then-exit cycle therefore costs `2 × 3bps = 6bps` total, not the `3bps` the name implies for one full round trip.** This is a genuine naming/documentation inconsistency, flagged by this audit (see the Block 8.4 report §7 for the full cost-sensitivity implications) — and importantly, it means costs were CONSERVATIVELY OVER-charged relative to the "3bps round trip" label, not under-charged, so it does not overstate R3-B's edge. No code was changed to "fix" this (R3-B is frozen, per this block's explicit prohibition); it is documented here and carried into the cost-sensitivity analysis.

## 10. What R3-B Was Promoted Under

Block 8.3's mechanical `classifyStrategy` CANDIDATE gate (positive full-period / OOS / majority walk-forward / sufficient sample quality) **plus** the post-funnel review script's two override criteria: Deflated Sharpe Ratio ≥ 0.5 (computed within the 24-trial daily-native-family pool) **and** correlation vs. RS3M classified `HIGH` diversification value (`|correlation| < 0.3`).

---

*This specification is the baseline every audit in `docs/BLOCK8_4_R3B_INDEPENDENT_VERIFICATION_REPORT.md` is checked against. If the independent reproduction (§1 of that report) produces different signals/trades than this spec implies when applied to the ORIGINAL implementation, that is itself a discrepancy to report — never silently reconciled by editing this document after the fact.*
