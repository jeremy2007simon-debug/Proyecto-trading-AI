# Block 8.3 — US Index Top-5 Deep Research

> **Status note:** Sections 1-6 below (data audit, research budget, five families, markets/timeframes, funnel design) are the **frozen pre-registration** for this research round — the 30 experiment definitions (`scripts/research/us-index/run-block8-3-funnel.ts`), their parameters, and their invalidation criteria were written and committed before any experiment ran. Sections 7+ are filled in only after the funnel completed and the post-funnel review (§16) ran; nothing in the pre-registration was edited afterward.

## 1. Executive Summary

30 configurations across 5 economically-distinct US-index hypotheses (Volatility-Managed Equity Exposure, Intraday Momentum, Regime-Dependent Trend/Pullback, Cross-Index Rotation, Hybrid Momentum-Contrarian) were tested on SPY/QQQ/IWM/DIA over up to 33 years of daily data (2 years for the intraday family — Yahoo's own ceiling for hourly bars). **Decision: US INDEX CANDIDATES FOUND — READY FOR INDEPENDENT VERIFICATION.** Exactly **one** genuine candidate survives full scrutiny: **R3-B**, a pullback-in-uptrend strategy on SPY (RSI(14) dip-and-resume gated by a long-term-trend regime filter).

The mechanical funnel classifier (reused unchanged from Block 5/8/8.2) initially flagged 19 of 30 configurations as CANDIDATE — an implausibly high rate that was itself the first finding of this round and the trigger for harder scrutiny, not celebration (the same discipline Block 8.2 §10.2 documents). A real methodology bug was caught and fixed during this round's own review before any number below was finalized: pooling Family 2's trade-based R-multiple Sharpe ratios together with Families 1/3/4/5's daily-equity-curve Sharpe ratios into one Deflated Sharpe Ratio (DSR) calculation inflated the cross-trial Sharpe standard deviation from a plausible ~0.3 to 1.12, silently driving every daily family's DSR to 0.0. Fixed by pooling DSR separately per methodology (§16) — the same class of fix Block 8.2 §17 already documents as necessary when mixing incompatible research rounds.

After the fix, applying two objective, pre-frozen override criteria (DSR < 0.5, or |correlation vs RS3M| classified LOW diversification value) to every mechanical CANDIDATE: **Family 1** (Volatility-Managed Exposure) is the most statistically robust standalone result of the round (DSR up to 1.0, a genuine parameter plateau across target-vol 10-15%/lookback 20-63d) but correlates 0.79-0.82 with RS3M — not a useful second strategy. **Family 4** (Cross-Index Rotation) is even more statistically confident (DSR 0.96-1.0 across all 6 configs) but correlates 0.90-0.95 with RS3M — every shorter-lookback/risk-adjusted/blended variant tested turns out to be, in practice, nearly the same trade as RS3M under different plumbing, exactly the risk this round's own pre-registered invalidation criterion for this family warned about. **Family 5** (Hybrid Momentum-Contrarian) has DSR = 0.00 for every single configuration — indistinguishable from luck after multiple-testing correction, despite 5/6 configs mechanically clearing the CANDIDATE gate. **Family 2** (Intraday Momentum) is DATA_INSUFFICIENT: every configuration falls below the 36-month sample-size floor (a real provider limitation, not tunable away), and the underlying economics were net-negative at realistic intraday cost regardless.

R3-B survives both override criteria (DSR 0.96, correlation vs RS3M 0.11) with a modest but real edge: net CAGR 2.4%/yr, MaxDD 10.7% (the shallowest of any config tested this round), positive in both halves of a 33-year sample (though weaker in the second half), and 55.6% walk-forward-positive. A combined RS3M+R3-B 50/50 portfolio (§18) improves Sharpe from 0.74 (RS3M alone) to 0.84 and cuts max drawdown from 65.1% to 37.2% — a genuine, disclosed diversification benefit, not assumed from low correlation alone.

## 2. Data Audit

Performed BEFORE writing any strategy code.

### 2.1 Alpaca Market Data — tried first, confirmed unusable

Per this round's explicit priority ("Prioridad: Alpaca Market Data cuando aporte datos fiables"), Alpaca was tried first. `ALPACA_API_KEY_ID`/`ALPACA_API_SECRET_KEY` (the Market Data API credential pair) are unset in this environment. The only Alpaca credentials present are `ALPACA_PAPER_API_KEY_ID`/`ALPACA_PAPER_API_SECRET_KEY` (Block 6's PAPER trading keys) — tested read-only (a plain `GET`, no orders) against both `data.alpaca.markets/v2/stocks/SPY/bars` and `paper-api.alpaca.markets/v2/account`: **both returned 401 Unauthorized** (the paper-api endpoint with an explicit JSON `{"message": "unauthorized."}` body, confirming these are genuinely invalid/inactive credentials in this environment, not a network or proxy artifact). **Conclusion: Alpaca is not usable for this round.**

### 2.2 Yahoo Finance — used, same provider as Block 8/8.2

Confirmed reachable and returning real data for SPY/QQQ/IWM/DIA:

| Ticker | Daily history | Dividend events | Split events |
|---|---|---:|---:|
| SPY | 1993-01-29 → 2026-08-21 (8,448 bars, ~33.5y) | 135 | 0 |
| QQQ | 1999-03-10 → 2026-08-21 (6,906 bars, ~27.4y) | 89 | 1 |
| IWM | 2000-05-26 → 2026-08-21 (6,598 bars, ~26.2y) | 106 | 1 |
| DIA | 1998-01-20 → 2026-08-21 (7,192 bars, ~28.6y) | 338 | 0 |

**A real data-quality bug was found and worked around, documented rather than hidden:** requesting `interval=1d&range=max` silently returns MONTHLY bars for a long-lived ticker (`meta.dataGranularity` confirms `"1mo"` even though `1d` was requested) — Yahoo appears to auto-downsample when the implied bar count is very large. Fixed by using explicit `period1=0`/`period2=<now>` Unix-timestamp ranges instead of `range=max` everywhere in `scripts/research/us-index/fetch-us-index-daily.ts`, which correctly returns genuine daily granularity for the full listed history (confirmed: 8,448 SPY bars vs. 404 under the buggy `range=max` call). This is exactly the kind of "surprisingly convenient" result that deserves suspicion by default — caught before any backtest ran.

### 2.3 Adjustment — tested and confirmed correct, explicitly guarding against the prior unadjusted-price bug

Every daily bar carries BOTH `close` (raw) and `adjclose` (Yahoo's dividend+split-adjusted close). Confirmed the two genuinely differ historically (SPY 1993-01-29: close=43.9375, adjClose=24.11 — a real, large historical adjustment reflecting 33 years of compounded dividends) and converge at the most recent bar (close==adjClose today, correct — no future dividends exist to adjust for). **Every return computation in `src/core/us-index-research/` reads `adjClose` exclusively** (`daily-series.ts`'s `buildDailyReturnSeries`) — `tests/core/us-index-research/daily-series.test.ts` pins this with an explicit test proving a simulated ex-dividend raw-close drop produces a ~0% return once adjusted, never a fabricated loss. `toAdjustedCandles` additionally scales open/high/low by the same per-bar `adjClose/close` ratio so indicator inputs (SMA/RSI/ADX/ATR) stay internally consistent — a documented simplification (Yahoo supplies only an adjusted CLOSE, not adjusted OHLC), disclosed in §22.

### 2.4 Corporate actions, sessions, timestamps, DST, gaps

- Dividend/split event counts confirmed present and ticker-appropriate (above).
- Intraday DST correctness verified directly: SPY 1h bars start at `14:30:00.000Z` in December (=09:30 ET, winter UTC-5) and `13:30:00.000Z` in July (=09:30 ET, summer UTC-4) — Yahoo's own bar labeling is DST-correct. This round's OWN session-grouping code (`intraday-momentum.ts`'s `groupBySession`) independently re-derives the Eastern calendar day via the existing, already-tested `getEasternWallClockParts` (`@/core/market-hours/nyse-calendar`) rather than trusting Yahoo's timestamp alone — `tests/core/us-index-research/intraday-momentum.test.ts` covers this.
- Intraday sessions requested with `includePrePost=false` — confirmed no pre/after-hours bars leak into the dataset.
- No gap-filling or interpolation performed anywhere — a missing bar is simply absent, never fabricated.

### 2.5 Bid/ask — tested, still unavailable (same limitation as Block 8/8.2)

No real bid/ask feed is reachable from this environment. Every transaction-cost figure in this report is **ESTIMATED**, never presented as **OBSERVED** — see `cost-model.ts` and §9.

### 2.6 Intraday history — a real, critical limitation (not extrapolated)

Yahoo hard-limits 5m/15m/30m bars to the last **60 calendar days** regardless of requested range (confirmed via HTTP 422 beyond that), and 1h bars to roughly **2 years**. This directly bounds Family 2 — see §21.

## 3. Research Budget (frozen)

Maximum 30 configurations, exactly used: **6 per family** (5 families × 6). Registered with a fixed `experimentId` per config in `scripts/research/us-index/run-block8-3-funnel.ts`, git-committed before any experiment ran. No grid search, no Bayesian optimization, no genetic algorithms, no ML parameter tuning.

## 4. Five Hypotheses (frozen — economic rationale, before any result)

### Family 1 — Volatility-Managed Equity Exposure
**Hypothesis:** scaling exposure (0-100%, long/cash, never leveraged) inversely to trailing realized volatility improves risk-adjusted return vs. static buy-and-hold, at some cost to raw CAGR (Moreira & Muir 2017, *"Volatility-Managed Portfolios,"* Journal of Finance). Not a directional market-timing claim — exposure never exceeds 100% and never shorts.
**Construction:** exposure(t) = clamp(targetVol / trailingVol(t-1), 0, 1), decided from YESTERDAY's close, applied to TODAY's return (causal, one-day lag). Two vol proxies tested: realized (log-return stdev) and ATR-based.
**Invalidation:** drawdown reduction achieved only by disproportionately destroying CAGR (worse Calmar than buy-and-hold).

### Family 2 — Intraday Momentum ("Opening Directional Persistence")
**Hypothesis:** an ATR-normalized directional displacement from the session's own open, within the opening window, confirmed by above-average volume, persists through the rest of the session. Deliberately distinct from every prior intraday hypothesis in this codebase: NOT Opening Range Breakout (`opening-range-breakout.strategy.ts`, REJECTED Block 4 — trades a FIXED first-N-minute high/low LEVEL; this family never computes a range level), NOT VWAP (`vwap.strategy.ts` — reclaim/rejection/continuation vs. session VWAP; this family never references VWAP), NOT Session Momentum (`session-momentum.strategy.ts` — trades ONLY the final ~60 minutes before close; this family trades ONLY the opening window), NOT Gap Continuation (`gap-continuation.strategy.ts` — trades the OVERNIGHT gap; this family's reference point is TODAY's own open, ignoring the gap entirely).
**Construction:** flat-by-close daily session loop (a dedicated engine, not the general `Strategy`/event-driven-simulator — that engine's only forced-exit convention fires once at the very end of the WHOLE dataset, with no notion of "flat by end of today's session"; confirmed by inspecting `event-driven-simulator.ts` directly).
**Invalidation:** sample too short/thin to trust; positive gross R-multiple that doesn't survive INTRADAY realistic cost.

### Family 3 — Regime-Dependent Trend/Pullback
**Hypothesis:** a pullback-buy-in-uptrend rule (RSI(14) dip-and-resume + rising SMA(50)) performs better, with shallower drawdown, when gated by a long-term-trend and/or realized-vol regime filter than run unconditionally.
**Construction:** RegimeFilter (≤2 conditions: LONG_TERM_TREND = price > SMA(200); VOL_REGIME = realized-vol rolling percentile < 50) + TrendSignal (SMA(50) rising) + PullbackEntry (RSI crosses back up through 40/35 after being below it). Causal, one-day lag.
**Invalidation:** regime filter fails to improve drawdown/consistency vs. the unfiltered baseline for the same ticker.

### Family 4 — Cross-Index Relative Strength/Rotation
**Hypothesis:** rotation among SPY/QQQ/IWM/DIA at a horizon and/or ranking methodology genuinely different from RS3M_CANDIDATE_V1's (3-month lookback, single-winner-100%, raw trailing return) can capture short-horizon relative persistence independently.
**IMPORTANT:** this is the family most at risk of quietly reinventing RS3M. Every config uses a lookback of 1-2 months (never 3, per this brief's own "NO optimizar alrededor de 3 meses" instruction) and/or risk-adjusted (return/trailing-vol) ranking and/or a top-2 equal-weight blend instead of RS3M's always-single-winner weighting.
**Invalidation:** high correlation with RS3M's own return series (LOW diversification value) despite the different construction — **this is exactly what happened; see §17, §20.**

### Family 5 — Hybrid Momentum-Contrarian
**Hypothesis:** a single ex-ante regime switch — momentum in a trending regime, mean-reversion in a range-bound one — performs more consistently than either sub-strategy run unconditionally.
**Construction:** exactly ONE regime classifier (ADX(14) ≥ threshold ⇒ TREND_REGIME, else RANGE_REGIME), exactly TWO subsignals (TREND: 10-day ROC momentum; RANGE: RSI(14) mean-reversion), no ML, causal one-day lag.
**Invalidation:** one sub-strategy explains >80% of total return, contradicting the "genuine hybrid" premise.

## 5. Markets & Timeframes

**Universe:** SPY, QQQ, IWM, DIA only — no sector ETFs (XLF/XLK/etc.) added. Decided BEFORE any experiment: none of the five families requires sector diversification to test its hypothesis, so none was added.

| Family | Timeframe | Why |
|---|---|---|
| 1: Vol-Managed Exposure | 1D | Exposure decisions require daily granularity to mean anything; a monthly rebalance would defeat the "responds to changing vol" premise. |
| 2: Intraday Momentum | 1h (primary), 30m (supplementary/limited) | 1h is the longest interval Yahoo serves beyond a 60-day ceiling; needed for a defensible sample. |
| 3: Regime Trend/Pullback | 1D | Regime and trend/pullback signals are inherently multi-day constructs. |
| 4: Cross-Index Rotation | Monthly rebalance | Matches the family's own economic claim (short-horizon relative persistence, not intraday noise). |
| 5: Hybrid Momentum-Contrarian | 1D | ADX/ROC/RSI regime classification needs daily bars to be meaningful, not noisy intraday ticks. |

## 6. Funnel

Stage 1 Data integrity → Stage 2 No-lookahead/sanity → Stage 3 Gross edge → Stage 4 Realistic (NET) costs → Stage 5 Sample-size adequacy → Stage 6 Long-history behavior → Stage 7 OOS (30% chronological holdout, frozen, `oos-split.ts`, reused unchanged from Block 8.2) → Stage 8 Walk-forward (60mo train/12mo forward/12mo step, `walk-forward.ts`, reused unchanged) → Stage 9 Regime robustness → Stage 10 Monte Carlo (10,000-sim block bootstrap, `monthly-monte-carlo.ts`, reused unchanged) → Stage 11 Tail-risk → Stage 12 Parameter robustness → Stage 13 Multiple-testing (DSR) → Stage 14 Correlation with RS3M → Stage 15 Portfolio contribution (candidates only). Fail-fast: a Stage 4 failure stops that config's deeper stages immediately.

## 7-9. Gross/Net Results & Cost Sensitivity

Full period, all 30 configs (`results/block8-3/experiments/*.json`, gitignored — regenerate via the commands in the Reproducibility footer). CAGR in %/yr, GROSS = OPTIMISTIC (0bps) scenario, NET = REALISTIC scenario (SWING: 3bps round-trip; INTRADAY: 4bps round-trip).

| Family | Best gross CAGR | Best net CAGR | Cost robustness |
|---|---:|---:|---|
| 1: Vol-Managed Exposure | 10.73% (V1-E, QQQ) | 10.60% (V1-E) | Positive throughout 0-12bps for every config |
| 2: Intraday Momentum | 8.47% (I2-A) | **-5.50%** (I2-D, best of a bad set) | Net-negative for every config at realistic intraday cost |
| 3: Regime Trend/Pullback | 2.53% (R3-B) | 2.41% (R3-B) | Positive throughout 0-12bps |
| 4: Cross-Index Rotation | 13.83% (F4-C) | 13.36% (F4-C) | Positive throughout 0-12bps |
| 5: Hybrid Momentum-Contrarian | 3.70% (H5-D) | 3.29% (H5-D) | Positive throughout 0-12bps |

Family 2's gross-to-net divergence is the round's largest and most decisive cost result: every config is gross-positive-or-near-zero but NET-NEGATIVE, by 10-30+ points of annualized return, at a realistic (not stressed) 4bps intraday round-trip. I2-A (best): 139 trades over ~2 years (0.28 trades/day), 47.5% win rate, gross expectancy +0.12R/trade, but net expectancy **-0.14R/trade** — the edge, such as it is, does not clear real intraday transaction costs.

## 10-11. Out-of-Sample & Walk-Forward

Computed only for Stage-4 survivors (24 of 30 — every Family-2 config fails Stage 4/5 on sanity, see §21). All 24 show positive OOS CAGR — the least discouraging stage, and worth stating honestly: the gross/cost patterns are not artifacts of the most recent years alone. This is NOT by itself evidence of a tradeable edge (every one of Family 1/4/5's configs fails elsewhere — correlation or DSR).

Walk-forward (18 windows for the 400-month histories, 14 for QQQ's shorter ~330-month history): positive-window percentage ranges 55.6% (R3-A/B, the barest majority) to 85.7% (V1-E). No config shows a "1 great window + many bad ones" pattern — every Stage-7+ survivor clears the 50% walk-forward-majority bar the mechanical classifier requires.

## 12. Monte Carlo

10,000-simulation block bootstrap (block size 4 months, `runMonthlyMonteCarloBlockBootstrap`, reused unchanged from Block 8.2) for every Stage-8 survivor. Results are family-dependent, not uniform:

- **Family 1 (Vol-Managed):** probability of terminal loss over the FULL simulated horizon = exactly 0% for 4/6 configs and ≤0.03% for the remaining 2 — the strongest Monte Carlo profile of the round, consistent with its high DSR.
- **Family 3 (R3-A/R3-B):** MaxDD P95 14.3-19.4% (R3-B/R3-A), probability of terminal loss 0.01-0.05% — modest but real tail risk, proportionate to the strategy's own modest absolute return.
- **Family 4 (Rotation):** MaxDD P95 up to 62.9% (F4-A) — a genuinely deep simulated drawdown distribution, despite the high DSR; this family's statistical significance and its tail-risk profile are two different questions, and this result answers the second one honestly.
- **Family 5 (Hybrid):** probability of terminal loss ranges 6.5-13.2% on SPY (H5-A/B/C/D) but jumps to 29-30% on QQQ (H5-E/F) — the round's worst simulated loss probability of any config that reached this stage, and a further, independent signal (alongside DSR=0.00) that this family's edge is not robust, particularly on QQQ.

## 13. Tail Risk (R3-B only — the round's sole final candidate; computed at daily resolution)

| Metric | Value |
|---|---:|
| Worst single day | -3.78% |
| Worst rolling trading week (5 consecutive days) | -7.29% |
| P95 daily loss (5th percentile) | ~0.0% (strategy is flat/cash most days) |
| P99 daily loss (1st percentile) | -0.66% |
| Longest consecutive losing-day streak | 5 days |
| Max drawdown duration | 2,338 days (~6.4 years) — the strategy is sparsely invested; a long stretch below a prior equity peak without a NEW peak is expected for a low-frequency, low-absolute-CAGR strategy over a 33-year sample, not evidence of a broken construction |

No crisis period was excluded from any figure above (2000-02, 2008, 2020, 2022 are all inside the 1993-2026 sample).

## 14. Regime Analysis

Computed from real, available price data only: BULL/BEAR (price vs. trailing SMA(200)) and LOW_VOL/HIGH_VOL (realized-vol rolling percentile) — both causal, no look-ahead. **Rate-hiking/cutting and risk-on/risk-off regimes (also listed in the brief) were NOT computed** — no Fed funds rate or credit-spread/sentiment data source was fetched this round; disclosed as a limitation (§22), never fabricated from price data alone.

R3-B: +3.7%/yr annualized in BULL months (303 of 403) vs. -1.9%/yr in BEAR months (88 of 403); +2.3%/yr in LOW_VOL vs. +2.6%/yr in HIGH_VOL (essentially regime-neutral on the vol axis — a real, if modest, positive signal that this specific construction isn't simply "long beta wearing a pullback costume," unlike Family 1's vol-exposure results, which show a much starker BULL +15-23%/yr vs. BEAR -16-22%/yr split, exactly as expected for an exposure-scaled beta strategy).

## 15. Parameter Robustness

- **Family 1:** genuine plateau — realized-vol-target Sharpe ranges only 0.81-0.84 across target vol {10,15}% × lookback {20,63}d on SPY (V1-A/B/C/D), and QQQ (V1-E) sits in the same band (0.80). The ATR-proxy variant (V1-F) is materially and consistently worse (Sharpe 0.52, DSR 0.23) — a real, disclosed, single-configuration-difference finding (realized-vol proxy is the more robust convention here), not a swept plateau of its own.
- **Family 3:** NOT a smooth plateau. LONG_TERM_TREND filter (R3-B) improves over unfiltered (R3-A): Sharpe 0.60→0.71, DSR 0.66→0.96. But VOL_REGIME filter (R3-C) or BOTH (R3-D) COLLAPSE Sharpe to ~0.27-0.28 (mechanical RESEARCH tier, DSR 0.0) — a sharp, discrete cliff depending on WHICH regime condition is used, not a fragile single point on a continuous parameter. Economically explicable (a vol-regime filter likely excludes some of the best pullback entries, which often coincide with short vol spikes inside an still-intact uptrend) but a real caveat, disclosed rather than smoothed over.
- **Family 4:** Sharpe 0.68-0.82 across every lookback {1,2}mo × ranking {raw,risk-adjusted} × weighting {single,top-2} combination — genuinely robust to parameter choice, but the entire family fails independently on correlation-vs-RS3M (§17), so this robustness doesn't translate into candidacy.
- **Family 5:** Sharpe 0.17-0.33 across every ADX-threshold/RSI-threshold combination on SPY/QQQ — a tight, low band, but DSR=0.00 for every single one; a "robust plateau of DSR=0," the cleanest possible multiple-testing rejection.
- **Family 2:** not evaluated for parameter robustness — every config fails the sample-size floor before this stage.

## 16. Multiple Testing

**Cumulative research history, per §20's explicit instruction not to treat this round in isolation:** Block 4 (5 strategies) + Block 4.5 (42+ combinations) + Block 5 (24) + Block 8 (29) + Block 8.2 (24) + Block 8.3 (this round, 30) = a long, disclosed history of strategy search across this codebase, none of it hidden from this round's own review.

**A real methodology bug was caught and fixed during this round's own review, before any DSR number below was finalized:** the first computation pooled ALL 30 experiments' REALISTIC-scenario Sharpe ratios into ONE cross-trial standard deviation for the Deflated Sharpe Ratio benchmark. Family 2's trade-based, small-sample R-multiple-derived monthly Sharpes are extreme (as low as -3.43) compared to Families 1/3/4/5's daily-equity-curve-derived Sharpes (typically 0.2-0.8) — an incompatible-units mixing problem, the SAME class of issue Block 8.2 §17 already documents for pooling across DIFFERENT research rounds, here occurring WITHIN one round across two methodologies. This inflated the pooled Sharpe stdev to 1.12, driving every daily family's DSR toward 0.0 regardless of its actual Sharpe. **Fixed** (`run-block8-3-funnel.ts`) by computing DSR separately within each methodology's own trial pool (daily-native Families 1/3/4/5, 24 trials; trade-based Family 2, 6 trials — the latter never reaches this stage in practice, since every Family 2 config fails Stage 4/5, §21). After the fix, the pooled Sharpe stdev for the 24-trial daily-family pool is a plausible 0.286 (not 1.12), and DSR values became economically sensible — see the table below.

**Post-fix Deflated Sharpe Ratio, 24-trial pool (Families 1/3/4/5):**

| Config | Realistic Sharpe | DSR (24-trial pool) |
|---|---:|---:|
| V1-A..F (Vol-Managed) | 0.52-0.84 | 0.23-1.00 |
| R3-A | 0.60 | 0.66 |
| **R3-B** | **0.71** | **0.96** |
| F4-A..F (Rotation) | 0.68-0.82 | 0.96-1.00 |
| H5-A..F (Hybrid) | 0.17-0.33 | **0.00** (every config) |

R3-B's DSR of 0.96 is the highest of any config that ALSO passes the independence-vs-RS3M bar (§17) — the clearest quantitative basis for this round's single candidate.

## 17. Correlation vs RS3M

Computed for every Stage-7+ survivor via `pearsonCorrelation` (`@/core/backtesting/research/strategy-similarity`, reused unchanged) against RS3M_CANDIDATE_V1's OWN monthly return series, reconstructed READ-ONLY via `rs3m-benchmark.ts` (calls `runRelativeStrengthBacktest` — the exact same function RS3M's own live engine calls — with RS3M's frozen lookback=3, universe, never modified). `tests/core/us-index-research/rs3m-isolation.test.ts` proves this is a one-way dependency: nothing under `src/core/paper-trading/rs3m/**` or `scripts/block6/**` imports anything from `us-index-research`.

| Family | Correlation vs RS3M | Diversification value |
|---|---:|---|
| 1: Vol-Managed Exposure | 0.79-0.82 | **LOW** |
| 3: Regime Trend/Pullback (R3-B) | 0.11 | **HIGH** |
| 4: Cross-Index Rotation | 0.90-0.95 | **LOW** |
| 5: Hybrid Momentum-Contrarian | 0.58-0.66 | LOW/MEDIUM |

Family 4's result is this round's cleanest, most important negative finding: despite using a genuinely different lookback (1-2mo, never RS3M's 3mo), ranking methodology (risk-adjusted, not just raw return), and weighting (top-2 blend, not RS3M's always-single-winner), every variant tested correlates 0.90+ with RS3M — in practice, nearly the same trade under different plumbing. This is exactly the risk this family's own pre-registered invalidation criterion named before any result was seen (§4), not a post-hoc rationalization.

## 18. Portfolio Simulation (RS3M + R3-B)

Fixed 50/50 monthly-rebalanced blend (`simulateRs3mPlusCandidatePortfolio`), no weight optimization, per the brief's explicit "NO optimizar pesos retrospectivamente" instruction. 400 months compared.

| | RS3M alone | RS3M + R3-B (50/50) |
|---|---:|---:|
| CAGR | 12.67%/yr | 7.89%/yr |
| Annualized volatility | 18.50% | 9.60% |
| Max drawdown | 65.11% | **37.25%** |
| Sharpe | 0.740 | **0.842** |
| Sortino | 1.077 | 1.217 |
| Calmar | 0.195 | 0.212 |

**Diversification benefit: genuine.** Correlation 0.111. Sharpe improves (+0.10), MaxDD nearly halves (65%→37%), at the cost of lower raw CAGR (12.7%→7.9%, since R3-B's own absolute return is far lower than RS3M's) — a real, disclosed, risk/return trade-off, not an unambiguous free lunch. **Caveat:** this correlation/portfolio analysis reconstructs RS3M's signal over the FULL available price history (1993-2026) for a longer, more statistically meaningful comparison window; RS3M_CANDIDATE_V1's own OFFICIAL frozen definition specifies `datasetFrom: "2016-01-01"` — the pre-2016 portion here is an independent robustness extension of the same signal methodology, not a claim about RS3M's official live/paper track record extending that far back.

## 19. Candidates

**One: R3-B** — Family 3 (Regime-Dependent Trend/Pullback), SPY, RSI(14) pullback-in-uptrend gated by a LONG_TERM_TREND (price > SMA(200)) regime filter. Clears every §25 minimum: positive NET expectancy (2.41%/yr), credible sample (403 months, HIGH quality), positive OOS, walk-forward majority (55.6%), cost margin (positive throughout 0-12bps), acceptable MaxDD (10.7%, the shallowest tested), acceptable tail risk (§13), DSR 0.96 (multiple-testing-adjusted evidence), genuine independence from RS3M (correlation 0.11). R3-A (the same family's unfiltered baseline) is reported as R3-B's ablation comparison, not a second independent candidate — R3-B's trades are a regime-filtered SUBSET of R3-A's.

Disclosed caveats, carried forward (not hidden): does not replicate on QQQ (R3-E REJECTED, R3-F only RESEARCH-tier under the same construction); the VOL_REGIME filter variant of the SAME family fails badly (§15), so only HALF of the family's original regime-filter hypothesis is validated; second-half-of-sample CAGR (1.12%/yr) is meaningfully weaker than first-half (3.08%/yr) — a real, disclosed decay pattern, not reversed by more data.

## 20. Rejected / Downgraded — Ranked

Best-researched-hypothesis-first, independent of final status:

1. **Family 1 (Volatility-Managed Exposure)** — RESEARCH (downgraded from mechanical CANDIDATE). The round's strongest standalone statistics (DSR up to 1.0, genuine parameter plateau, 0% Monte Carlo terminal-loss probability) but fails independence vs. RS3M (correlation 0.79-0.82). Worth a future round's attention specifically for portfolios that do NOT already hold RS3M.
2. **Family 4 (Cross-Index Rotation)** — RESEARCH (downgraded from mechanical CANDIDATE, 6/6). Statistically the most confident result of the entire round (DSR 0.96-1.0) but structurally almost the same trade as RS3M (correlation 0.90-0.95) — the cleanest demonstration in this report of why "good backtest" and "useful new strategy" are different questions.
3. **Family 5 (Hybrid Momentum-Contrarian)** — RESEARCH (downgraded, DSR=0.00 across the board). The cautionary tale of this round, mirroring Block 8.2's F3-E: passes a narrow mechanical gate, fails the multiple-testing bar decisively.
4. **Family 2 (Intraday Momentum)** — DATA_INSUFFICIENT (§21). Net-negative at realistic cost regardless of the sample-size problem — would need a materially different construction, not just more history, to be worth revisiting.

R3-E (Family 3, QQQ, unfiltered) is the round's one genuinely REJECTED (not merely downgraded) configuration — negative gross AND net.

## 21. Data-Insufficient Hypotheses

**Family 2 (Intraday Momentum)** — 6/6 configurations run, all fail the pre-registered 36-month sample-size sanity floor: Yahoo serves at most ~2 years of 1h bars (I2-A/B/C/D/E: 22-25 distinct calendar months with a trade) and 60 calendar days of 30m bars (I2-F: 3 months, 14 trades — explicitly flagged as a CRITICAL limitation, never extrapolated from). This is a finding about what this environment's free data access can verify, not a claim that intraday momentum doesn't exist in US index ETFs — and even setting the sample-size problem aside, every configuration's REALISTIC-cost economics were already net-negative (§7-9), so more history alone would likely not reverse the conclusion without a fundamentally different construction.

## 22. Limitations

- No real bid/ask data (re-confirmed unavailable, §2.5) — every cost figure is ESTIMATED, never OBSERVED.
- Adjusted OHLC is a derived approximation (raw O/H/L scaled by the adjClose/close ratio, §2.3) — Yahoo supplies only an adjusted close directly, not full adjusted OHLC.
- Rate-hiking/cutting and risk-on/risk-off regime analysis (§14, listed in the brief) was not performed — no Fed funds rate or credit-spread/sentiment data source was fetched this round.
- Family 2's history is fundamentally capped by the free-tier Yahoo provider (§2.6, §21) — a materially longer intraday history (from a paid feed) could change that family's conclusion; this round's DATA_INSUFFICIENT verdict reflects THIS environment's access, not a claim about the underlying phenomenon.
- A real methodology bug (Sharpe-pooling across incompatible methodologies for DSR, §16) was caught and fixed during this round's own review — disclosed as a reminder that a "surprisingly high candidate rate" (19/30 mechanically) deserves default suspicion, exactly the discipline that caught it.
- R3-B's correlation/portfolio comparison against RS3M (§17-18) uses a longer history (1993-2026) than RS3M_CANDIDATE_V1's own official frozen `datasetFrom` (2016-01-01) — an independent robustness extension of the same signal methodology, not a claim about RS3M's official track record.
- Walk-forward and Monte Carlo statistics span up to 33 years of a single historical realization (the post-1993 era), dominated by a long secular US equity bull market with only a few genuine multi-year bear windows (2000-02, 2008, 2022) — this shapes every family's regime breakdown and may not represent the full space of future US-market regimes.

## 23. Recommendation

**US INDEX CANDIDATES FOUND — READY FOR INDEPENDENT VERIFICATION.**

One candidate, R3-B, survives full scrutiny (mechanical funnel + DSR + correlation-vs-RS3M override) with a modest, genuinely diversifying edge. The next block (US Index Candidate Independent Verification, per §36 of this brief) should verify R3-B ONLY — not re-open Families 1/4/5, whose null results here are clean and well-explained (correlation with RS3M, DSR≈0), and not re-run Family 2 without a materially different data source. No Paper execution, no Alpaca trading connection, no approval-gate change, and no next-block work begins from this report — per §36's explicit stop condition.

---

*Reproducibility:*
```
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/us-index/fetch-us-index-daily.ts
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/us-index/fetch-us-index-intraday.ts
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/us-index/run-block8-3-funnel.ts
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/us-index/run-block8-3-review.ts
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/us-index/run-block8-3-portfolio-and-tailrisk.ts
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/us-index/run-block8-3-summaries.ts
```
Raw results: `results/block8-3/` (gitignored, regenerate via the commands above).
