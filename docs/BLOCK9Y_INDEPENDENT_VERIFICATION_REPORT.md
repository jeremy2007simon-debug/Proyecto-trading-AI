# Block 9.y — Independent Candidate Verification: C-A and E-C

> **Role note:** this is an INDEPENDENT FALSIFICATION round, not a promotion round. The goal was to try to kill both of Block 9.x's mechanical candidates. Zero survivors was an accepted outcome. Neither candidate's original implementation (`src/core/strategy2-research/short-term-reversal.ts`, `volatility-risk-premium.ts`) was modified anywhere in this block.

## Decision

**C-A: VERIFIED. E-C: REJECTED.**

E-C's Block 9.x `CANDIDATE` status is **not confirmed** — independent reproduction found a real, confirmed implementation bug in the original E-C code (a calendar-days-vs-trading-days lookback error) that materially inflated its reported performance. C-A's independent reproduction found only an immaterial, fully-explained discrepancy and the candidate clears every falsification test applied.

## 1. Frozen Candidate Specifications

Full specs: `src/core/strategy2-verification/candidate-specs.ts`. Extracted by hand-reading Block 9.x's original implementation and pre-registration BEFORE any verification code ran. Same hashing convention as `RS3M_CANDIDATE_V1`/R3-B (FNV-1a over canonical JSON).

| | C-A | E-C |
|---|---|---|
| **Spec hash** | `f6b860f5` | `6b8da4c9` |
| Signal | Bottom-decile trailing-252d daily-return trigger, SPY, 1-day hold | Long SVXY, VIX-percentile-gated entry (≤ median), hard -15% stop |
| Market/instrument | SP500 / SPY | CBOE volatility complex / SVXY |
| Entry timing | Enter at day (i-1)'s close on trigger | Enter at yesterday's close when filter ON and flat |
| Exit timing | Always exactly 1 trading day | Stop breach or filter OFF |
| Sizing | 100% notional, no leverage | 100% notional, no leverage |
| Stop logic | None (bounded by 1-day hold) | Hard -15%, checked against day's LOW |
| Costs | `SWING_ROUND_TRIP_BPS` (0/3/10bps) | `SWING_ROUND_TRIP_BPS` (0/3/10bps) |
| Data source | Yahoo Finance daily OHLC, SPY, 1993-01-29+ | Yahoo Finance daily OHLC (SVXY, 2011-10-04+) + FRED VIXCLS |
| Parameters | `lookbackDays: 252, decileThreshold: 0.1, holdDays: 1` | `stopLossPct: 0.15, vixPercentileFilterBelow: 0.5, vixLookbackDays: 252` |

No parameter changed after verification began. Pinned by `tests/core/strategy2-verification/independent-verification.test.ts`.

## 2. Critical Portfolio Metric Reconciliation

**Confirmed: this was a real reporting bug, now fixed.**

**Root cause:** Block 9.x's `docs/BLOCK9B_STRATEGY2_DEEP_BACKTEST_REPORT.md` §5 computed each candidate's "RS3M alone" portfolio baseline by intersecting RS3M's full benchmark series with *that candidate's own* available months, independently per candidate. E-C's own series only starts ~2011 (SVXY inception), so its overlap with RS3M landed mostly in RS3M's calmer post-2016 regime (Sharpe 1.097 / MaxDD 23.67%). C-A's own series starts ~1994 (SPY), so its overlap included RS3M's much harsher 2000-2009 stretch (Sharpe 0.736 / MaxDD 65.11%). Both tables were internally self-consistent, but the end-of-block chat summary presented both candidates' blends against a **single** "RS3M alone" column (1.097/23.67%) — silently applying E-C's window's RS3M baseline to C-A's blend figures too. **That cross-table mixing is the bug**, not a fabricated number in either underlying table.

**Fix applied:** portfolio comparisons are now computed on two explicit, identically-defined windows, applied uniformly to both candidates:

### OFFICIAL window (RS3M's own `datasetFrom`, 2016-01 → 2026-08, 128 months)

| | RS3M alone | C-A blend (50/50) | E-C blend (50/50) |
|---|---:|---:|---:|
| Sharpe | **1.028** | 1.039 (↑) | 0.970 (↓) |
| Max Drawdown | **23.67%** | 20.16% (↑) | 21.46% (↑) |
| CAGR | 17.72% | 10.50% | 16.57% |

RS3M-alone is now the **identical** number (1.028 / 23.67%) regardless of which candidate it's compared against — the bug this section exists to catch.

### EXTENDED window (full natural overlap per candidate — NOT the same window for both, explicitly labeled)

| | C-A: 1994-01→2026-08 (392mo) | E-C: 2011-10→2026-08 (179mo) |
|---|---:|---:|
| RS3M alone Sharpe / MaxDD | 0.736 / 65.11% | 1.097 / 23.67% |
| Blend Sharpe / MaxDD | **0.878 / 44.19%** (both improve) | **0.903 / 26.40%** (both WORSE than RS3M alone) |

**Correct reading:** C-A's original claim ("both Sharpe and MaxDD improve") holds on its own correct window, official or extended. **E-C's original claim does not hold once the spec-compliant (bug-fixed) implementation is used** — on the extended window, the blended Sharpe drops (1.097→0.903) and MaxDD is *worse*, not better (23.67%→26.40%). This is reported plainly because it's a real result, not adjusted to flatter either candidate.

**Regression test added:** `tests/core/strategy2-verification/independent-verification.test.ts` — "the OFFICIAL-window RS3M-alone metric is IDENTICAL regardless of which candidate it is compared against."

## 3. Independent Implementation & Reproduction

Fresh code, zero imports from the original signal modules (`src/core/strategy2-verification/independent-c-a.ts`, `independent-e-c.ts`), using deliberately different (but equally standard) algorithms — a different percentile-interpolation method for C-A, a different VIX-percentile-rank convention and window-construction approach for E-C — so any discrepancy reflects a genuine difference, not code reuse masking a shared bug.

### C-A: PASS (explained, immaterial)
- 4 / 8,194 common trading days show a trigger-day mismatch (0.05%).
- Net total return: 253.3% (original) vs. 247.8% (independent) — 5.5pp gap.
- **Fully explained**: the two implementations use different decile-threshold interpolation conventions (linear interpolation vs. nearest-rank), which occasionally disagree right at the boundary. This is a documented, expected class of difference, not a bug.

### E-C: **FAIL** — a real, confirmed bug in the original
- 369 / 3,741 common trading days show a position mismatch (**9.9%**).
- Net total return: **1215.9%** (original) vs. **449.7%** (independent) — a ~2.7x gap.
- **Root cause, confirmed numerically**: the original's `vixPercentileFilterBelow` lookback (`vixLookbackDays: 252`) is applied via `addDaysApprox(date, -252)` — **252 CALENDAR days**, not 252 trading days. A 252-calendar-day window contains only **~180 actual trading-day VIX observations** (confirmed on real data: a 2020-01-15 anchor's calendar-252-day window spans 2019-05-08→2020-01-14, 180 observations, vs. the spec-intended 252-trading-day window spanning 2019-01-28→2020-01-14). Every other lookback parameter in this codebase (C-A's own 252-day lookback, `regime.ts`'s realized-vol lookback) counts trading days — this is a genuine implementation bug relative to the original's own stated intent ("trailing-1-year VIX percentile"), not a legitimate methodological choice.
- Per this block's own rule ("do not repair a failing candidate in this block"), **the bug is documented, not fixed here**. The **spec-compliant (independent) implementation is used as the reference for every E-C analysis below.**

## 4-8. C-A Verification Detail

- **No-lookahead**: adversarial mutation tests (mutate a future bar, confirm past signals unchanged) pass — `tests/core/strategy2-research/no-lookahead.test.ts` (Block 9.x) plus new reproduction-comparison tests this block.
- **Cost realism**: OPTIMISTIC +358.6%, REALISTIC +253.3%, 2×REALISTIC (6bps) +172.1%, STRESSED (10bps) +92.1% — net-positive throughout the entire tested range, never a gross-only anomaly.
- **Break-even cost: 17.8bps** — nearly 6x the REALISTIC 3bps assumption and comfortably above the 10bps STRESSED scenario. ~26.8 trades/year.
- **Parameter robustness** (falsification, not optimization — no better neighbor selected):

| Dimension | Base Sharpe | -10% | -5% | +5% | +10% | Classification |
|---|---:|---:|---:|---:|---:|---|
| Decile threshold | 0.613 | 0.568 | 0.585 | 0.578 | 0.574 | **PLATEAU** |
| Lookback (252d) | 0.606 | 0.564 | 0.551 | 0.583 | 0.587 | **PLATEAU** |

Both dimensions: max Sharpe drop across all 4 perturbations stays under 20% of base — genuinely on a plateau, not a disguised cliff.

- **Subperiods**: all 4 decade buckets positive (1990s +50.1%, 2000-09 +27.2%, 2010-19 +39.8%, 2020-present +32.4%). Both halves positive (+89.9% / +86.1%). Recent 10y +37.3%, **recent 5y +8.9%** — notably weaker recently, a real, disclosed decay signal worth watching, not disqualifying on its own given the full-history and both-halves results.
- **Concentration**: full total +253.3% → excluding best 5 trades: **+111.4%** (still strongly positive, not collapsing) → excluding best 5 months: **+124.3%**. A real but graceful degradation — not dependent on a handful of outlier events.
- **OOS**: +35.4% (117 months). **Rolling OOS**: 80% positive (15 windows, worst -15.7%). **Walk-forward**: 70.7% positive (41 windows, worst -7.2%, best +13.0%).
- **RS3M correlation, richer**: return correlation **0.077** (excellent), drawdown correlation **0.492** (notably higher — C-A tends to be underwater at similar *times* to RS3M even though month-to-month returns aren't correlated; a real, disclosed nuance), exposure overlap 10.6% (C-A is in the market only ~1 day in 10, mechanically limiting overlap), crisis-quartile correlation **0.052** (stays uncorrelated even in RS3M's worst months — the strongest single diversification result of this whole verification).

## 9-16. E-C Verification Detail (spec-compliant/independent series)

- **Economic exposure check**: confirmed LONG SVXY (harvesting the VRP), matching the claimed "short-vol-ETP holder" exposure — direction not changed again in this block.
- **SVXY structural breaks, documented**:
  - **Inception 2011-10-04** — a hard floor on usable history, not a chosen window.
  - **2018-02-27 deleveraging** — ProShares' SEC filing dated 2018-02-26 cut SVXY's target exposure from **-1x to -0.5x**, effective the next trading day, directly in response to the 2018-02-05 event. **Pre- and post-2018-02-27 SVXY are structurally different-leverage products** — this backtest (like Block 9.x's) treats the whole series as one continuous instrument, a real, disclosed limitation, not silently ignored.
- **Volmageddon isolation (real Yahoo daily bars)**: SVXY close-to-close, 2018-02-02→2018-02-05: -32.0%. **Overnight gap, 2018-02-05 close (143.64) → 2018-02-06 open (23.40): -83.7%.** Close-to-close Feb 5→Feb 6: **-83.0% in one trading day.** The spec-compliant E-C implementation had **zero exposure** during this entire window (2018-02-01→02-12) — the VIX-percentile filter happened to be OFF. **This is a real, disclosed finding: this candidate got lucky, not necessarily durably protected** — the filter's specific mechanism for avoiding this episode was not independently stress-tested against a repeat with different filter phase timing.
- **Gap-through-stop realism**: across ~15 years, the spec-compliant implementation entered a position only **3 times total**, and **all 3 entries ended in a stop-loss** (2015-06-29, 2016-09-13, 2017-08-17) — a 100% stop rate on n=3, a strong overfitting/mistimed-entry signal from a very thin sample. In all 3 cases the breach was **intraday-only** (the day's LOW breached -15%, but the OPEN had not already gapped through) — so the gap-aware model's realized loss matches the naive model's exactly (-15%) in every historical instance that occurred. **This does not mean gap risk is zero** — it means gap risk did not bind in this specific, small (n=3) historical sample; a synthetic test (`tests/core/strategy2-verification/independent-verification.test.ts`) confirms the gap-aware model DOES realize a worse-than-15% loss when a synthetic Volmageddon-magnitude gap is injected, so the mechanism is correctly implemented and ready to bind on a future occurrence.
- **Other stress episodes** (spec-compliant series, real data): 2015 Aug shock -1.9% (small live exposure); **Feb 2018, Q4 2018, and Mar 2020 COVID crash: all 0.0%** (flat, filter OFF for all three of the dataset's worst crises); 2022 vol/rate regime -14.2% (candidate was exposed and lost, vs. instrument's own -22.3%).
- **Tail testing**: block-bootstrap Monte Carlo (naive and gap-aware — identical, since no historical gap-through occurred): **P95 MaxDD 64.0%, P99 72.9%**, terminal-loss probability reported alongside. **Worst real (non-simulated) drawdown: 55.2%.**
- **Costs**: OPTIMISTIC +479.3%, REALISTIC +449.7%, STRESSED +386.3% — net-positive throughout, cost-scenario-threading bug (Block 9.x's own, already fixed then) reconfirmed not to have recurred (all three genuinely distinct).
- **Parameter robustness**:

| Dimension | Base Sharpe | -10% | -5% | +5% | +10% | Classification |
|---|---:|---:|---:|---:|---:|---|
| Stop threshold | 0.534 | 0.524 | 0.527 | 0.526 | 0.521 | PLATEAU |
| VIX-percentile threshold | 0.534 | 0.675 | 0.656 | 0.620 | 0.632 | PLATEAU |

Robustness alone does not save E-C — the reproduction failure and DSR/WF failures below are decisive independent of this.

- **DSR (cumulative pool, spec-compliant series): 0.265** — well below the 0.5 bar.
- **OOS**: +44.4% (53 months) — positive, but **walk-forward: 46.7% positive (15 windows), below the 50% majority bar** (worst window -20.2%, best +85.4% — a very wide, unstable spread consistent with the thin n=3-entry sample).

## 17. Multiple Testing

Cumulative pool carried forward **unchanged at ≥171** (154 prior + 17 of Block 9.x's own executed trials) — this verification round adds **0 new trials** (an audit, not new discovery, per Block 8.4's own precedent for R3-B). Sharpe-stdev proxy (0.2146) reused from Block 9.x's own 17-trial pool, disclosed as a proxy, not re-derived. DSR: **C-A 0.695** (unchanged from Block 9.x — confirms stability), **E-C 0.265** (spec-compliant series; the 0.995 Block 9.x originally reported is invalidated by the confirmed reproduction bug).

## 18. OOS / Walk-Forward / Rolling OOS

Both independently reproduced this block (`splitMonthsChronologically`, `buildMonthlyWalkForwardWindows`, both reused unmodified, plus a new expanding-window rolling-OOS check in the style of Block 8.4's R3-B audit). See §4-8/§9-16 above for figures. No parameter decision in either candidate uses a future window at any stage.

## 19. RS3M Correlation — Full Detail

| | Return corr. | Drawdown corr. | Exposure overlap | Crisis-quartile corr. |
|---|---:|---:|---:|---:|
| C-A | 0.077 | 0.492 | 10.6% | 0.052 |
| E-C | 0.275 | 0.185 | 4.6% | 0.146 |

Neither candidate was assessed on full-history Pearson return correlation alone.

## 20. Portfolio Test

See §2 for the full official/extended window tables (50/50 fixed weights, no optimization). No equal-risk variant was computed — methodology would need to be frozen before this section per the brief's own instruction, and was not pre-committed, so it is skipped rather than added post hoc.

## 21. Candidate Decisions

**C-A: VERIFIED.** No decisive criterion failed: reproduction explained, DSR 0.695 (≥0.5), OOS/rolling-OOS/WF all positive-majority, both robustness dimensions PLATEAU, correlation 0.077 (well under 0.30 "ideal" bar), portfolio contribution genuine on both windows.

**E-C: REJECTED.** Reproduction FAILED (confirmed original-implementation bug) is decisive on its own per this block's rule; independently reinforced by DSR 0.265 (<0.5), walk-forward 46.7% (<50%), a 100%-stop-rate on only 3 historical entries, and a weaker-not-better spec-compliant portfolio contribution on the extended window. **Not repaired in this block.**

## 22. Paper / Execution

Neither candidate connected to Paper, Alpaca, options, or LIVE. No orders submitted. No approval controls added.

## 23. RS3M Protection

Hash `1c28b57c` — confirmed unchanged before and after (read-only reuse of `buildRs3mBenchmarkSeries` only). Block 6, the Routine, and Paper trading state: unmodified.

## 24. NovaCore

Research Lab updated READ-ONLY: `STRATEGY2_CANDIDATES` figures updated to the verification outcome (E-C's Block 9.x figures superseded by the spec-compliant numbers; both candidates' `independentVerificationStatus` updated from `NOT_STARTED`), plus a new `STRATEGY2_VERIFICATION_OUTCOMES` section with full reproduction/failure-point detail. **Neither candidate added to Bots.** No execution changes.

## 25. Reproducibility

```
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/strategy2/run-block9y-verification.ts
```

Reuses Block 9.x's already-fetched datasets (`results/block9b/datasets/`) — no re-fetch, no new data source. Raw output: `results/block9y/verification-partial.json` (gitignored, regenerate via the command above). This report and the frozen specs/independent-implementation code are what get committed.
