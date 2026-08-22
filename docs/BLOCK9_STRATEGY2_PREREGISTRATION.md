# Block 9 — Strategy #2 Pre-Registration (FROZEN)

**Status: FROZEN before any Block 9-B backtest is run.** This document exists specifically so that the eventual deep-backtest phase cannot silently redefine what counts as success after seeing results. Any deviation from what's written here, made after seeing a single result, invalidates that result's candidate status under this project's own standards (the same standard Block 5/8/8.2/8.3 already hold themselves to).

This document does not authorize Block 9-B to start. Per the brief's own §29 STOP instruction, the deep backtest is a separate, explicitly-gated future block pending human review of `docs/BLOCK9_STRATEGY2_DISCOVERY_REPORT.md`.

## 1. Families (frozen, ranked)

1. **D — Overnight / Intraday Return Decomposition**
2. **E — Volatility Risk Premium** (defined-risk structure mandatory — see §4)
3. **M — Turn-of-Month / Calendar Seasonality**
4. **F — Defensive / Low-Volatility Equity**
5. **C — Short-Term Reversal** (large-liquid-ETF-only)

No sixth family. No substitution after seeing any result. No R3-B-derived family (explicitly excluded per the brief's own instruction not to react to R3-B's cliffs).

## 2. Markets

All five families trade only: **SPY, QQQ, IWM, DIA** — this project's existing 4-ETF universe (same as RS3M and Blocks 5/8.3). No new tickers, no individual stocks, no international markets. E additionally requires either an exchange-traded volatility ETP (SVXY and/or VXX) or SPY options — both frozen as in-scope instruments for E only, not the other four families.

## 3. Timeframes (frozen per family)

| Family | Signal frequency | Holding period |
|---|---|---|
| D | Daily (close→open, open→close) | Overnight or intraday, per config — never both legs held simultaneously as separate positions in the same config |
| E | Weekly-to-monthly (option/ETP roll cycle) | 1 week to 1 month per structure, config-dependent |
| M | Monthly-recurring | 1-4 trading days per month (window frozen in §4) |
| F | Monthly | Full month, rebalanced monthly |
| C | Daily-to-weekly, event-triggered | 1-5 trading days, config-dependent |

## 4. Signals and Parameter Ranges (frozen — no tuning after seeing OOS/walk-forward results)

**D — Overnight/Intraday (4 configs, D-A..D-D):**
- D-A: Long SPY from close to next open (overnight-only), flat intraday. No parameters beyond asset choice.
- D-B: Long QQQ from close to next open (overnight-only), flat intraday.
- D-C: SPY, both legs as separate simultaneous sub-positions: long overnight (close→open) AND short intraday (open→close) — the full "tug of war" hypothesis tested directly.
- D-D: Long IWM from close to next open (overnight-only), flat intraday.
- No thresholds, no filters, no regime conditioning in any D config — deliberately the simplest possible test of the raw decomposition before any refinement is considered.

**E — Volatility Risk Premium (4 configs, E-A..E-D), ALL defined-risk (§16 gate — no naive unhedged short-vol config is in-scope):**
- E-A: Short a fixed small notional of SVXY (or the then-available equivalent short-VIX-futures ETP), with a hard stop-loss at -15% of position value, unconditional entry (always short, subject to the stop).
- E-B: SPY monthly put credit spread (sell a ~10-delta put, buy a ~5-delta put further OTM, same expiration ~30 days out), unconditional entry.
- E-C: Same structure as E-A, but entry gated on a VIX-percentile filter (only enter when trailing 1-year VIX percentile is BELOW its median — i.e., skip the trade when implied vol is already historically cheap, since the premium being harvested is smallest there).
- E-D: Same structure as E-B, but entry gated on the same VIX-percentile filter as E-C.
- Deltas (~10/~5), stop level (-15%), and the percentile threshold (median, i.e., 50th percentile) are fixed here, before any data is examined — not tuned.

**M — Turn-of-Month (4 configs, M-A..M-D):**
- Fixed window for all four: long from the close of the last trading day of the month through the close of the 3rd trading day of the next month (4 trading days total exposure), flat otherwise. Reused, unmodified, from the McConnell & Xu (2008) window definition — not re-derived from this project's own data.
- M-A: SPY. M-B: QQQ. M-C: IWM. M-D: DIA.
- **Mandatory analysis, not a 5th config:** each config's full-sample result must be reported ALONGSIDE its most-recent-10-years-only subperiod result, specifically to test the decay hypothesis this family is flagged for (§11 of the discovery report). A config that is full-sample-positive but recent-decade-negative is a rejection signal, not a result to average away.

**F — Defensive/Low-Volatility Equity (4 configs, F-A..F-D):**
- F-A: In-house tilt — monthly rebalance, long the 2 of {SPY, QQQ, IWM, DIA} with the lowest trailing 20-trading-day realized volatility, equal-weighted.
- F-B: In-house tilt — same as F-A but ranked by trailing 60-trading-day beta vs. an equal-weight basket of all 4, instead of realized volatility.
- F-C: Long-only, unconditional, USMV (iShares MSCI USA Min Vol Factor ETF) — a listed low-vol product, no in-house ranking.
- F-D: Long-only, unconditional, SPLV (Invesco S&P 500 Low Volatility ETF) — a second listed low-vol product using a different provider methodology, as a cross-check on F-C.
- Lookback windows (20-day, 60-day) are fixed here, not tuned.

**C — Short-Term Reversal (4 configs, C-A..C-D), SPY/QQQ/IWM/DIA only:**
- C-A: SPY time-series reversal — go long for 1 trading day after any day where SPY's close-to-close return falls in the bottom decile of its own trailing 252-trading-day return distribution.
- C-B: QQQ time-series reversal — same rule, applied to QQQ.
- C-C: Cross-sectional daily reversal — each day, go long (1-day hold) the single worst performer among {SPY, QQQ, IWM, DIA} over the prior trading day, unconditionally (no decile filter — a pure "always trade the day's loser" rule).
- C-D: Cross-sectional weekly reversal — each week, go long (1-week hold) the single worst performer among the same 4 over the prior trading week.
- The bottom-decile threshold (C-A/C-B) and the "prior trading day/week" ranking window (C-C/C-D) are fixed here, not tuned.

**Total: 20 configurations. Maximum for this round: 20. No expansion without a new, separately-justified pre-registration.**

## 5. Benchmarks (frozen)

Every config is compared against, at minimum:
- SPY buy-and-hold (or QQQ/IWM/DIA buy-and-hold, matching the config's own primary asset)
- Equal-weight SPY/QQQ/IWM/DIA buy-and-hold
- Zero-cost (gross) version of the same config, to isolate cost sensitivity
- RS3M_CANDIDATE_V1's own monthly return series, reconstructed READ-ONLY exactly as Block 8.3/8.4 already do (via `runRelativeStrengthBacktest`, never modified, never used as logic) — for correlation only, never as a performance bar

## 6. Cost Assumptions (frozen)

Reused, unmodified, from `src/core/us-index-research/cost-model.ts` (Block 8.3's own model, itself SPY/ETF-tuned):

| Scenario | `SWING_ROUND_TRIP_BPS` (D overnight-leg, M, F, C weekly variant) | `INTRADAY_ROUND_TRIP_BPS` (D intraday-leg, C daily variants) |
|---|---:|---:|
| OPTIMISTIC | 0 | 1 |
| REALISTIC | 3 | 4 |
| STRESSED | 10 | 12 |

All three scenarios reported for every config, per this project's established convention (GROSS and NET always shown together, never zero-cost presented as realistic). **E (options/ETP) is the one family without an existing reusable cost preset in this codebase** — its deep-backtest phase must build one (bid/ask spread + assignment/exercise cost for the options path, or expense-ratio/borrow-cost drag for the ETP path), the same way Block 8 built `forex-cost-presets.ts` for FX rather than misusing an equity-tuned preset. This is flagged here as a known prerequisite, not something to skip past.

## 7. OOS Methodology (frozen)

Chronological, non-shuffled 30% holdout via the existing `splitCandlesChronologically` utility (`src/core/backtesting/dataset-split.ts`), reused unmodified — the same convention Block 8.2/8.3 already use. No family gets a custom OOS ratio.

## 8. Walk-Forward Methodology (frozen)

Via the existing `buildWalkForwardWindows` utility (`src/core/backtesting/walk-forward.ts`), reused unmodified:
- **M, F** (monthly-frequency families): 60-month train / 12-month validation / 12-month forward / 12-month step — the same window Block 8.3 used.
- **D, C** (daily-frequency, high-turnover families): a shorter window is appropriate given their much higher trade count per unit time — 24-month train / 6-month validation / 6-month forward / 6-month step, chosen here (before any result is seen) specifically because a 60-month window would leave too few forward windows to say anything about stability for a strategy that trades daily.
- **E** (weekly-to-monthly roll): 36-month train / 6-month validation / 6-month forward / 6-month step, an intermediate choice given its intermediate turnover.
- Every window's per-window excess-return vs. its benchmark must be reported (not just the aggregate), per the lesson Block 8.4 §12 already drew from R3-B — walk-forward direction (crash protection vs. return generation) matters as much as the win rate.

## 9. Multiple-Testing Treatment (frozen)

Deflated Sharpe Ratio (`src/core/backtesting/research/deflated-sharpe.ts`), reused unmodified, computed **only for configs that reach the deep-validation stages** (never for all 20 base configs, per that module's own documented scope). The trial pool for that computation is **this project's full cumulative history, not just Block 9's own 20** — per `results/block9/cumulative-trial-ledger.json`, that means **≥154 (prior) + 20 (this block's pre-registered configs) = ≥174** at minimum, growing further with any config from a later round. The pool is never reset to a smaller number to flatter a future DSR — the same rule that sank R3-B applies here in advance, not retroactively.

## 10. Candidate Bar (frozen, per §20 of the brief)

A config must show ALL of the following to reach `CANDIDATE`:
1. Positive NET edge (REALISTIC cost scenario, not just OPTIMISTIC/zero-cost).
2. Credible sample size for its own timeframe (a daily-turnover family needs materially more trades than a monthly one to say anything — no single fixed trade-count bar applies to all 5 families).
3. OOS survival (net-positive on the chronological holdout).
4. Walk-forward stability (a clear majority of windows net-positive — not just the aggregate).
5. Cost margin (break-even cost materially above the REALISTIC scenario, not just barely above it).
6. Parameter plateau, not a cliff — since only fixed, pre-registered parameters are used (§4), this is checked via the SAME kind of ±5%/±10% perturbation sensitivity sweep Block 8.4 used on R3-B, applied prospectively this time rather than only in a later audit.
7. Acceptable tail risk and MaxDD for the family's own risk classification (E's defined-risk structures capped by design; D/C/M/F assessed against ordinary long-only equity drawdown norms).
8. Reasonable concentration (edge not dependent on a handful of outlier trades/months — same concentration-removal test Block 8.4 ran on R3-B).
9. Economic rationale intact (the result must be consistent with the mechanism claimed in the discovery report — e.g., a D config's edge must trace to the overnight/intraday split specifically, not some unrelated artifact).
10. **DSR compatible with the ≥174-trial cumulative pool (§9) — the exact bar (≥0.5) that rejected R3-B applies unchanged here.** No lowering this bar because five new families are being tested at once.
11. Useful diversification vs. RS3M: correlation <0.50 preferred, <0.30 ideal, per §21 — not a mechanical cutoff if a lower-correlation config has a materially worse risk profile, but any exception must be argued explicitly, not assumed.

## 11. Rejection Criteria (frozen)

A config is `REJECTED` if it fails ANY single item in §10 — there is no partial credit, matching this project's own established practice (R3-B failed only §10.10 and was still rejected). Family-specific pre-registered kill criteria, frozen in advance:

- **D, C:** net-negative under the REALISTIC cost scenario is an automatic rejection regardless of gross performance — this is the single most likely failure mode flagged in the discovery report for both families.
- **M:** net-positive full-sample but net-negative (or materially weaker) in the most-recent-10-years subperiod is treated as decay-driven rejection, even if the full-sample number alone would otherwise pass §10.
- **E:** any config that cannot be implemented as a defined-risk structure (i.e., any attempt to relax E-A's stop or E-B/E-D's spread structure to "improve" the backtest) is rejected on that basis alone, independent of its resulting Sharpe — the tail-risk gate in §16 of the discovery report is not negotiable after the fact.
- **F:** if F-A/F-B (in-house tilt) show |correlation vs. RS3M| > 0.6 (the same LOW-diversification-value threshold Block 8.3 already used to downgrade its own Families 1 and 4), they are downgraded to RESEARCH even if otherwise passing §10 — exactly the override discipline this project already applies elsewhere, not a new bar invented for F alone.

## 12. What Happens Next (explicitly NOT authorized by this document)

This pre-registration freezes the design. It does **not** authorize:
- Running any of the 20 configurations against real data.
- Modifying RS3M, Block 6, the Routine, Paper, or the approval gate.
- Adding anything to Strategy Hub or Bots.
- Building the E-family options cost preset or any new execution code.

Those steps belong to a future, separately-scoped Block 9-B, gated on human review of `docs/BLOCK9_STRATEGY2_DISCOVERY_REPORT.md` and this document, per the brief's own explicit §29 STOP instruction.
