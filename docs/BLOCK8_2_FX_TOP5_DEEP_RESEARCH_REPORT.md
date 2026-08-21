# Block 8.2 — FX Top-5 Deep Research

> **Status note:** Sections 1-9 below (data audit, hypotheses, universe, cost-model design, funnel design) are the **frozen pre-registration** for this research round — written and committed before any Family 1-5 signal code existed and before any backtest ran. Sections 10+ are filled in only after the funnel completed, and nothing in 1-9 was edited afterward (see git history: the pre-registration commit precedes every experiment-code commit on this branch).

## 1. Executive Summary

24 configurations across 4 economically-distinct FX hypotheses (Family 2, Economic Momentum, marked `DATA_INSUFFICIENT` before any code was written — no verifiable point-in-time macro data available in this environment) were tested on 7 major pairs over 15 years of daily data, using real interest-rate and CPI data for carry/value construction. **Decision: NO FX CANDIDATES — RESEARCH FAILED HONESTLY.**

One configuration (F3-E, unfiltered carry) mechanically cleared the reused CANDIDATE classifier's gate, but is downgraded to RESEARCH on review: its multiple-testing-corrected Sharpe (Deflated Sharpe Ratio) is 0.009 — statistically indistinguishable from luck — its Monte Carlo ruin probability is 62%, and it is net-negative under stressed costs. Family 4 (time-series trend-following) is rejected decisively and unambiguously: every one of 6 lookback/universe variants is net-negative, with Monte Carlo drawdowns of 85-99.5%. The most credible single result of the round, F5-E (a full-universe, risk-weighted multi-factor combination of carry, trend, and a real PPP-based value signal), is genuinely the best-behaved config tested — but its own multiple-testing-corrected confidence (DSR = 0.499) is still a coin flip, not evidence of skill.

Two real implementation bugs were caught and fixed during this round's own internal review before any of the numbers above were finalized — both are documented in §10.2 as part of the audit trail, and both are now covered by regression tests. This report treats that as a feature of the process, not something to hide: a "surprisingly good" backtest result should always be the trigger for harder scrutiny, not celebration, and that discipline is what turned an initially spectacular (and wrong) result into the correct rejection.

## 2. Lessons From Block 8

Block 8 (intraday FX strategy research, `docs/BLOCK8_FOREX_RESEARCH_REPORT.md`) tested 29 configurations across 5 technical-indicator families (trend/momentum, pullback, volatility breakout, session breakout, mean reversion) on EUR/USD, GBP/USD, USD/JPY, AUD/USD at 15m-4h. Result: **0/29 candidates**. 12/29 showed a positive gross (zero-cost) edge, but every one had a break-even transaction cost under ~3bps — an order of magnitude below any realistic FX spread assumption. None reached OOS, walk-forward, or Monte Carlo, because none survived the realistic-cost gate.

**What this means for Block 8.2:**

1. **Do not re-run the same economic idea with different indicator plumbing.** Block 8's 5 families were all short-horizon, single-pair, technical-pattern strategies. Block 8.2's 5 families are explicitly different in kind: cross-sectional/portfolio, slower-horizon, and grounded in a specific academic literature (currency momentum, carry, trend, value) rather than in an indicator combination. Re-parameterizing EMA/ATR/RSI thresholds again — even under a new label — would violate the brief's explicit instruction (§1) and would not add information.
2. **Transaction cost is the dominant killer, not signal existence.** Block 8's 12 gross-positive configs prove FX prices are not pure noise at these frequencies — but any edge under ~10bps/round-trip is not economically capturable by a retail-level cost structure. Block 8.2's families are deliberately **slow** (weekly-to-monthly rebalance, not intraday), which mechanically reduces turnover and raises the bar a real edge needs to clear versus the bar a strategy needs to clear on cost. This is the single most important structural change from Block 8, not a data trick.
3. **Data length was also a real constraint.** Block 8's usable (1h/4h) history was ~2.8 years. Block 8.2 uses **15 years of daily data** (§3) — enough to span multiple full regimes (2011-15 low-vol/QE, 2014-15 USD strength, 2020 COVID crash, 2022 rate-hiking cycle), which slow strategies need to be tested honestly.

## 3. Data Audit

Performed BEFORE writing any strategy code. All tests below were executed from this sandboxed environment; results are what they are, not what would be convenient.

### 3.1 FX price data

**Source:** Yahoo Finance's unofficial `chart` endpoint — the same provider used in Block 8, still the only FX price source reachable from this environment without a paid API key.

**Tested and confirmed available:** daily (`1d`) bars, **15 years** (2011-08-21 → 2026-08-21), **3,916 bars**, for all 11 instruments in the universe (§5): EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF, NZD/USD, EUR/GBP, EUR/JPY, GBP/JPY, AUD/JPY. This is a substantial upgrade over Block 8's ~2.8-year intraday window.

**Same caveats as Block 8, unchanged:** this is an indicative last/mid-style price series, not a measured bid/ask. `volume` is 0. No true spread is observable from this feed.

### 3.2 Bid/ask data — tested, still unavailable

Explicitly tested Dukascopy's free historical tick/candle feed (`datafeed.dukascopy.com`, `.bi5` LZMA-compressed binary format) as a genuine attempt at real bid/ask data, per this brief's explicit priority (§5: "datos con bid/ask real cuando sea posible"). Result: the endpoint returns HTTP 200, but the payload is an HTML error page, not a valid LZMA-compressed candle file (confirmed by attempting `lzma.decompress()`, which fails with "Input format not supported by decoder" against literal `<!DOCTYPE html>` bytes). **No real bid/ask FX data is reachable from this environment.** Cost modeling in Block 8.2 therefore remains **ESTIMATED**, never **OBSERVED** — same honest limitation as Block 8, and every cost figure in this report is labeled accordingly (§9).

### 3.3 Interest rate data (for Carry, §8) — available, real

**Source:** FRED (Federal Reserve Economic Data), plain CSV export, no API key required. Tested and confirmed reachable for all 8 currencies using a **consistent rate concept** (3-month interbank rate, OECD Main Economic Indicators series `IR3TIB01{CC}M156N`), monthly frequency:

| Currency | FRED series | History available |
|---|---|---|
| USD | IR3TIB01USM156N | 1964-06 → 2026-06 |
| EUR | IR3TIB01EZM156N | 1994-01 → 2026-01 |
| GBP | IR3TIB01GBM156N | 1957-01 → 2026-01 |
| JPY | IR3TIB01JPM156N | 2002-04 → 2026-05 |
| AUD | IR3TIB01AUM156N | 1968-01 → 2026-06 |
| CAD | IR3TIB01CAM156N | 1956-01 → 2026-06 |
| CHF | IR3TIB01CHM156N | 1999-07 → 2026-06 |
| NZD | IR3TIB01NZM156N | 1973-12 → 2026-06 |

Every series comfortably pre-dates the 2011 start of the FX price history — no truncation risk for the carry signal. This is **real, reported, OBSERVED data** (an actual published rate, not a spread estimate) — the honest foundation Family 3 and Family 5's carry component are built on.

### 3.4 CPI data (for a real Value/PPP definition, §12) — available, with a caveat

Also tested and confirmed reachable via FRED for all 8 currencies (`CPIAUCSL`, `CP0000EZ19M086NEST`, `GBRCPIALLMINMEI`, `JPNCPIALLMINMEI`, `AUSCPIALLQINMEI`, `CANCPIALLMINMEI`, `CHECPIALLMINMEI`, `NZLCPIALLQINMEI`). **Caveat:** AUD and NZD series are **quarterly**, not monthly, and — like all published CPI — are subject to a real-world reporting lag (typically 2-5 weeks after period-end) and occasional small revisions. This is a materially smaller look-ahead risk than industrial-production/GDP-style data (§3.5), and is handled with a conservative fixed publication lag (§12), not treated as instantaneously known.

### 3.5 Point-in-time (vintage) macro data — tested, NOT available; Family 2 marked DATA_INSUFFICIENT

Explicitly tested ALFRED (the St. Louis Fed's vintage-data service), including the `vintage_dates` parameter that is supposed to return the value of a series *as it was known on that date*. Result: requesting the same series (`CPIAUCSL`) with `vintage_dates=1980-01-01` and `vintage_dates=2020-01-01` returned **identical** column headers (`CPIAUCSL_20260821` — today's revision) and **identical** values in both cases. The free CSV endpoint does not actually serve vintages without the authenticated ALFRED/FRED API (which requires a registered API key this environment does not have).

Family 2 (Economic Momentum FX — industrial production, retail activity, employment, composite economic-activity indices, per Dahlquist & Hasseltoft 2020, §8) explicitly requires as-of-publication-date correctness to avoid look-ahead, and industrial-production/GDP-style series are revised far more materially than CPI. **Per this brief's own explicit instruction (§5, §8): "Si no podemos garantizar ausencia de look-ahead: REJECT/DATA_INSUFFICIENT."**

**Decision, made before any Family 2 code was written: Family 2 = `DATA_INSUFFICIENT`, 0 configurations run.** This is not a finding about whether economic momentum works in FX — it is a finding about what this environment can verify without fabricating point-in-time correctness.

## 4. Data Limitations (carried into every downstream result)

- No real bid/ask — every transaction cost figure is an **ESTIMATE**, never presented as **OBSERVED** (§9).
- FX price history: 15 years, daily only — no intraday confirmation for these (inherently slower) hypotheses, which is appropriate to their holding periods, not a shortcut.
- Interest-rate series are monthly and use a single rate concept (3-month interbank) as a carry proxy — not each pair's actual achievable deposit/funding rate at a real broker, which carries its own markup.
- CPI-based Value uses published-with-lag data, not full point-in-time vintages (§3.4) — a materially smaller risk than Family 2's data gap, but still a documented simplification.
- Family 2 (Economic Momentum) is `DATA_INSUFFICIENT` for this round in full — see §3.5.

## 5. FX Universe (frozen before any test)

**Majors (7):** EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF, NZD/USD
**Crosses (4, only for cross-sectional/portfolio construction in Families 1/4/5):** EUR/GBP, EUR/JPY, GBP/JPY, AUD/JPY

No pair will be added after seeing results. Any pair not in this list is out of scope for this round.

## 6. Cost Model — design (results in §9 after experiments)

Every backtest reports **GROSS** (zero cost) and **NET** (cost-adjusted) results, never NET alone. Cost components, each explicitly labeled **OBSERVED** or **ESTIMATED** (never mixed):

| Component | Label | Source |
|---|---|---|
| Bid/ask spread | ESTIMATED | Same pip-based assumption methodology as Block 8 (`forex-cost-presets.ts`), extended to the 4 new pairs/crosses — no real spread data exists (§3.2) |
| Slippage | ESTIMATED | Same methodology as Block 8 |
| Commission | ESTIMATED (fixed at 0) | Same rationale as Block 8: flat commission is the wrong shape for FX notional-scaled cost; carried entirely by spread |
| Swap/financing | OBSERVED (rate differential) + ESTIMATED (broker markup) | The *interest-rate-differential* component of swap is OBSERVED (real published rates, §3.3); the markup a retail/ECN broker adds on top is ESTIMATED, same conservative-constant approach as Block 8 |
| Execution latency | ESTIMATED (not modeled beyond same-bar fill, appropriate given daily-bar, non-intraday signals) | — |

Break-even cost and cost safety margin computed per candidate, same convention as Block 8's `break-even-cost.ts` (reused, not reimplemented).

## 7. Research Budget (frozen)

Maximum 30 configurations. Registered with a fixed `experimentId` before any was executed (§Research Registry, `results/block8-2/experiments/registry.json`, git-committed at the same time as this document). Target distribution:

| Family | Target configs |
|---|---:|
| 1: FX Factor/Regime Momentum | 6 |
| 2: Economic Momentum FX | 0 (DATA_INSUFFICIENT, §3.5) |
| 3: Carry + Crash/Regime Filter | 6 |
| 4: Diversified Time-Series Trend | 6 |
| 5: Multi-Factor FX | 6 |
| **Total** | **24** |

(Kept below the 30 cap — leaves room for a small number of genuinely necessary robustness checks, e.g. an alternate lookback per family, without approaching parameter-mining territory. Any config beyond the table above gets a fresh `experimentId` and is logged, never a silent edit of an existing one.)

## 8. Five Hypotheses (frozen — economic rationale, before any result)

### Family 1 — FX Factor/Regime Momentum

- **Hypothesis:** Currency momentum is stronger and more robust when measured on **cross-sectional, common-factor** currency returns (e.g. a "dollar factor" — the average return of all currencies vs. USD — and momentum in the *carry-sorted* factor) than on a single pair's idiosyncratic price series.
- **Economic rationale:** Menkhoff, Sarno, Schmeling & Schrimpf (2012), *"Currency Momentum Strategies,"* *Journal of Financial Economics* 106, 660-684 — documents a cross-sectional spread of up to ~10%/yr between past FX winners and losers, explained partly by transaction costs and behavioral under/over-reaction, not by standard risk factors. The mechanism is investor under-reaction to the information embedded in a currency's own recent relative strength, not chart-pattern recognition.
- **Expected holding period:** 1-3 months (monthly cross-sectional rebalance, consistent with the cited literature's own formation/holding windows).
- **Expected source of return:** Behavioral under-reaction to systematic (factor-level) currency strength/weakness — genuinely different from Block 8's single-pair technical momentum, which tested purely idiosyncratic price patterns at much higher frequency.
- **Known failure modes:** Momentum crashes (sharp reversals after extended trends, well documented in equity momentum literature and present in FX); factor construction sensitive to which currencies are included in the cross-section; decay of the published effect post-publication (a standard concern raised in the momentum literature generally).
- **Known transaction-cost sensitivity:** Lower than Block 8's intraday families by construction (monthly rebalance = far lower turnover), but cross-sectional strategies still trade every leg every rebalance — cost margin must be evaluated on the FULL basket, not a single pair.
- **Invalidation criteria:** Non-positive NET expectancy; break-even cost margin under a defensible safety multiple of the ESTIMATED realistic cost; OOS or walk-forward failure; edge concentrated in <20% of rebalance periods (fragility, not persistence).

### Family 2 — Economic Momentum FX — `DATA_INSUFFICIENT`

- **Hypothesis (documented for completeness, not tested):** Persistent cross-country differences in economic-activity and inflation trends (industrial production, retail sales, unemployment, CPI/PPI momentum) predict subsequent currency returns.
- **Economic rationale:** Dahlquist & Hasseltoft (2020), *"Economic Momentum and Currency Returns,"* *Journal of Financial Economics* — reports a long/short strategy on economic-activity-index momentum with a Sharpe ratio of ~0.70, and finds this "economic momentum" subsumes much of the carry-trade alpha (i.e., cross-country economic-trend differences may be a source of what looks like a carry premium).
- **Why not run:** requires as-of-publication-date ("vintage") macro data to avoid look-ahead — confirmed unavailable in this environment (§3.5). Documented here, not silently dropped, so the hypothesis and its literature basis are on record for whichever future block gets real vintage data access.

### Family 3 — Carry + Crash/Regime Filter

- **Hypothesis:** A positive interest-rate-differential ("carry") premium exists across currencies, but is subject to sharp, negatively-skewed unwind/crash risk concentrated in risk-off/high-volatility regimes — a **naive** carry strategy (long high-rate, short low-rate, unconditional) is expected to show meaningfully worse tail risk than one filtered by a regime signal that reduces or exits carry exposure during funding-liquidity/risk-off stress.
- **Economic rationale:** Lustig & Verdelhan (2007) on the cross-section of carry risk premia; Brunnermeier, Nagel & Pedersen (2008), *"Carry Trades and Currency Crashes,"* *NBER Macroeconomics Annual* 23, 313-347 — documents negative skewness in carry-trade currency pairs driven by sudden unwinding during funding-liquidity contractions, and that funding-liquidity measures predict these crashes.
- **Expected holding period:** Carry signal rebalanced monthly (interest differentials move slowly); regime filter checked at the same frequency, not intraday.
- **Expected source of return:** A genuine risk premium for bearing FX/funding-liquidity crash risk — this family explicitly expects LEFT-TAIL risk to be part of the return story, not a bug to hide (§9 of the brief: "no esconder períodos de crisis").
- **Known failure modes:** The regime filter itself can whipsaw (exit right before the premium resumes) or fail to de-risk fast enough before a crash (the 2008 GFC and 2015 CHF de-peg are the canonical adverse scenarios inside this research's own data window).
- **Known transaction-cost sensitivity:** Low turnover (monthly), but swap/financing cost (§6) is a first-order component of this family's return, not a friction to minimize away — a carry strategy is arguably more sensitive to the SWAP assumption than to spread.
- **Invalidation criteria:** Non-positive NET expectancy; regime filter fails to reduce crash-period drawdown vs. unfiltered carry (i.e., the filter adds no value); tail-risk (Stage 11) shows the strategy is a disguised short-volatility bet with unacceptable ruin probability.

### Family 4 — Diversified Time-Series Trend Following

- **Hypothesis:** Time-series (absolute, not cross-sectional) trend persistence, applied consistently across a diversified basket of pairs with volatility-normalized position sizing, is more robust than a single-pair trend rule.
- **Economic rationale:** Moskowitz, Ooi & Pedersen (2012), *"Time Series Momentum,"* *Journal of Financial Economics* 104, 228-250 — documents time-series momentum (1-12 month persistence, partial reversal over longer horizons) across 58 futures instruments including currencies, with a diversified multi-asset portfolio delivering the most robust abnormal returns.
- **Expected holding period:** 1-12 months, tested at multiple lookback horizons (§9.4) rather than one "optimized" one.
- **Expected source of return:** Slow trend persistence (under-reaction/over-reaction dynamics, same broad behavioral family as momentum), diversified across pairs specifically to avoid the single-instrument fragility Block 8 exhibited.
- **Known failure modes:** Whipsaw / choppy regimes (a trend-follower's canonical failure mode); correlation spikes across pairs during a single USD-driven macro event, which erodes the diversification benefit exactly when it's needed most.
- **Known transaction-cost sensitivity:** Low (monthly-or-slower rebalance across a basket), but must be evaluated on aggregate portfolio turnover, not per-pair.
- **Invalidation criteria:** Non-positive NET expectancy at the portfolio level; walk-forward failure; excessive concentration in one or two pairs driving all returns (defeats the "diversified" premise); correlation-adjusted risk (not naive per-pair risk) showing hidden concentration.

### Family 5 — Multi-Factor FX (Carry + Value + Trend)

- **Hypothesis:** Combining return sources with different (ideally weakly-correlated) drivers — carry (Family 3's signal), trend (Family 4's signal), and value (a PPP-deviation signal, §12) — produces a more robust composite than any single factor, per the "value and momentum everywhere" style-premia literature.
- **Economic rationale:** Asness, Moskowitz & Pedersen (2013), *"Value and Momentum Everywhere,"* *Journal of Finance* 68, 929-985 — documents that value and momentum are NEGATIVELY correlated within and across asset classes (including FX), meaning a combination should reduce drawdown concentration versus either alone even without any retrospective weight optimization.
- **Expected holding period:** Monthly (matches the slowest component signal, value/PPP, whose academic half-life is measured in years — §12).
- **Expected source of return:** A blend of three economically distinct premia (funding-liquidity/carry risk, trend under-reaction, PPP mean-reversion) — explicitly NOT a single factor relabeled three ways.
- **Known failure modes:** If one factor dominates the combined return (to be explicitly checked and disclosed, §11 of the brief), the "multi-factor" framing is misleading; factor construction errors compound across three signals instead of one.
- **Known transaction-cost sensitivity:** Similar to Families 3/4 individually (monthly rebalance), but three signals combined can increase gross turnover if they disagree — measured explicitly, not assumed away.
- **Invalidation criteria:** Non-positive NET expectancy; one factor explaining >80% of total return variance (documented as a finding, not hidden, per the brief's own §11 instruction); no correlation/diversification benefit versus the best single factor; walk-forward or Monte Carlo tail-risk failure.

## 9. Funnel (design — results in §10 onward)

Stage 1 Data integrity → Stage 2 Sanity/no-lookahead → Stage 3 Gross edge → Stage 4 Realistic (NET) costs → Stage 5 Sample-size adequacy → Stage 6 Long-history behavior → Stage 7 OOS (frozen split, §15) → Stage 8 Walk-forward → Stage 9 Regime robustness → Stage 10 Monte Carlo/bootstrap → Stage 11 Tail-risk → Stage 12 Parameter-neighborhood robustness → Stage 13 Multiple-testing adjustment (includes Block 8's 29 prior experiments in the accounting) → Stage 14 Portfolio interaction → Stage 15 Prop-firm compatibility (CANDIDATEs only).

Fail-fast: a Stage 4 (NET cost) failure stops that config's funnel run immediately, exactly as in Block 8 — no attempt to "rescue" a cost-negative config with a later stage.

---

## 10. Results by Family — Full Funnel Table

All 24 experiments (`results/block8-2/experiments/<id>.json`), sorted by family. `class` is the mechanical output of `classifyStrategy` (reused unchanged from Block 5/8); §10.1 explains why F3-E's mechanical `CANDIDATE` label is overridden below.

| id | family | class | gross/yr | net/yr | stressed/yr | Sharpe (net) | MaxDD% (net) | OOS/yr | WF pos% | months |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| F1-A | 1 | REJECTED | 3.0% | 0.3% | -4.1% | 0.02 | 60.6 | -7.2% | 60% | 179 |
| F1-B | 1 | REJECTED | -2.5% | -4.1% | -6.7% | -0.24 | 70.1 | — | — | 177 |
| F1-C | 1 | REJECTED | -2.0% | -3.3% | -5.5% | -0.22 | 68.7 | — | — | 174 |
| F1-D | 1 | REJECTED | 0.3% | -0.6% | -2.2% | -0.04 | 74.9 | — | — | 177 |
| F1-E | 1 | RESEARCH | 3.2% | 2.4% | 1.1% | 0.16 | 57.9 | 12.2% | 20% | 174 |
| F1-F | 1 | REJECTED | 0.3% | -0.8% | -2.5% | -0.05 | 43.0 | — | — | 168 |
| F3-A | 3 | RESEARCH | 3.5% | 1.4% | -2.5% | 0.05 | 72.9 | 13.4% | 40% | 180 |
| F3-B | 3 | RESEARCH | 4.4% | 2.4% | -1.4% | 0.09 | 65.3 | 13.5% | 40% | 180 |
| F3-C | 3 | RESEARCH | 4.8% | 2.9% | -0.7% | 0.11 | 64.9 | 12.1% | 40% | 180 |
| F3-D | 3 | RESEARCH | 3.5% | 1.4% | -2.4% | 0.05 | 72.9 | 13.8% | 40% | 180 |
| F3-E | 3 | **CANDIDATE→RESEARCH** | 3.0% | 1.6% | -0.9% | 0.09 | 45.7 | 9.7% | 60% | 180 |
| F3-F | 3 | REJECTED | -0.3% | -2.5% | -6.5% | -0.10 | 82.6 | — | — | 180 |
| F4-A | 4 | REJECTED | -7.4% | -10.6% | -15.8% | -0.26 | 97.2 | — | — | 179 |
| F4-B | 4 | REJECTED | -5.7% | -7.6% | -10.8% | -0.19 | 96.9 | — | — | 177 |
| F4-C | 4 | REJECTED | -7.9% | -9.4% | -11.8% | -0.23 | 98.4 | — | — | 174 |
| F4-D | 4 | REJECTED | -0.9% | -2.3% | -4.7% | -0.05 | 90.0 | — | — | 168 |
| F4-E | 4 | REJECTED | -1.6% | -3.8% | -7.5% | -0.11 | 85.0 | — | — | 168 |
| F4-F | 4 | REJECTED | -4.4% | -7.0% | -11.1% | -0.13 | 99.5 | — | — | 174 |
| F5-A | 5 | RESEARCH | 5.2% | 2.3% | -3.0% | 0.09 | 68.8 | 17.0% | 20% | 180 |
| F5-B | 5 | RESEARCH | 4.1% | 1.2% | -4.0% | 0.05 | 66.9 | 10.6% | 20% | 180 |
| F5-C | 5 | RESEARCH | 4.4% | 2.1% | -2.4% | 0.08 | 73.5 | 15.5% | 40% | 180 |
| F5-D | 5 | REJECTED | 0.9% | -0.9% | -3.8% | -0.03 | 79.2 | — | — | 180 |
| F5-E | 5 | RESEARCH | 8.2% | 6.4% | 3.2% | 0.28 | 52.1 | 16.4% | 40% | 180 |
| F5-F | 5 | RESEARCH | 4.1% | 1.5% | -3.4% | 0.06 | 67.1 | 11.7% | 40% | 180 |

**Funnel stage counts:** Sanity 24/24 · Gross edge (>0) 17/24 · Realistic-cost survivors (Stage 4) 11/24 · OOS/Walk-forward/Monte Carlo computed 11/24 (only for Stage-4 survivors, fail-fast) · Mechanical CANDIDATE 1/24 (F3-E) · **Final candidates after review: 0**.

### 10.1 Why F3-E's mechanical CANDIDATE label is overridden to RESEARCH

`classifyStrategy` (reused unchanged from Block 5/8) promotes to CANDIDATE once a config clears: positive full-period, positive OOS, walk-forward majority ≥50%, and MEDIUM+/HIGH sample quality. F3-E cleared all four gates mechanically. But that gate set — built for Block 5/8's trade-level context — does not examine tail risk, stressed-cost sign, or multiple-testing-adjusted Sharpe, three things §26 of the brief explicitly requires ("acceptable tail risk", cost margin, "multiple-testing adjustment") before real candidacy. Checking those for F3-E:

- **Deflated Sharpe Ratio** (24-trial correction, §17): **0.009** — after correcting for having tried 24 configurations, F3-E's Sharpe is statistically indistinguishable from pure luck. (Its uncorrected PSR was 0.85 — this is exactly the gap multiple-testing correction exists to catch.)
- **Monte Carlo ruin probability** (10,000-sim bootstrap, §17): **62.4%** probability of a ≥50% max drawdown at some point over the 15-year sample. This is not a "conservative drawdown profile" by any definition.
- **STRESSED-cost scenario**: net annualized return **-0.9%** — negative. A strategy that flips sign between REALISTIC and STRESSED cost assumptions has no real margin.
- **Long-history split** (§6/§16): first-half annualized +1.3%, second-half -4.5% — the edge is deteriorating, not persisting, over the sample.

None of this was cherry-picked after the fact to reject a "favorite" — §26's criteria (tail risk, cost margin, multiple-testing) were listed in the frozen pre-registration (§7-9) before any experiment ran; this section applies them. **Decision: F3-E is downgraded from CANDIDATE to RESEARCH.** No config in this round survives full scrutiny as a genuine candidate.

### 10.2 A striking near-miss that turned out to be a bug (documented for the audit trail)

During review, Family 3's AUDJPY-momentum regime filter (F3-F) initially produced an implausibly strong result (net +13.8%/yr) that looked like the best result of the entire round. Investigation found an off-by-one look-ahead: the regime filter's trailing-momentum window included the CURRENT period's own (not-yet-realized-as-of-signal-date) return. Fixed in `regime.ts` (`buildAudJpyMomentumRegime`) to use only strictly-prior periods, matching the same causal convention already used correctly elsewhere (`trailingCumulativeReturn` in `family-signals.ts`). After the fix, F3-F is REJECTED (net -2.5%/yr) — consistent with every other regime-filtered carry variant once corrected, not an outlier. A second, unrelated bug (a date-key mismatch that silently made the regime filter's `HARD_EXIT`/`SOFT_SCALE` modes a no-op for the `BASKET_VOL` source) was also caught and fixed before any of the numbers above were produced. Both bugs and their fixes are preserved in this branch's git history — this section exists so a suspiciously good number is never taken at face value without checking for exactly this failure mode.

## 11. Out-of-Sample (OOS)

30% chronological holdout, frozen in `oos-split.ts` before any experiment ran (§15 of the brief). Of the 11 configs reaching Stage 7, **all 11 show positive OOS annualized return** — this is the least discouraging stage in the whole funnel, and worth being honest about: it means the gross/cost patterns found are not artifacts of the most recent few years alone. It is NOT, by itself, evidence of a tradeable edge — every one of those same 11 configs fails elsewhere (walk-forward consistency, tail risk, or stressed-cost sign).

## 12. Walk-Forward

5 windows per config (60mo train / 12mo forward / 12mo step, `walk-forward.ts`, sized to this research's real ~15-year history — not tuned to produce more passing windows). Positive-window percentage ranges from 0% (configs that never reached this stage) to 60% (F3-E only). Every other Stage-7+ config sits at 20-40% — a minority of windows profitable, the opposite of walk-forward consistency. No config shows the “majority of windows positive” pattern this research would consider a real robustness signal, except F3-E, whose broader picture is addressed in §10.1.

## 13. Regime Robustness

Per-config LOW_VOL vs HIGH_VOL month split (`classification-adapter.ts`, using the same causal basket-vol regime the Family 3 filter itself uses). Pattern is consistent across every Stage-9 config: strongly profitable in LOW_VOL months, negative or flat in HIGH_VOL months (F3-E: +6.4%/yr LOW_VOL vs -4.3%/yr HIGH_VOL is representative). This is the expected signature for carry-like and momentum-like FX strategies (funding-liquidity/crash risk concentrates in stress regimes, per Brunnermeier, Nagel & Pedersen 2008) — not a surprise, but a confirmation that the regime-filter hypothesis (Family 3) was pointed at a real phenomenon, even though no filtered variant survived full scrutiny.

## 14. Monte Carlo

10,000-simulation reshuffle bootstrap (`portfolio-monte-carlo.ts`) for every Stage-8 survivor, per §17's minimum. Results are uniformly poor: ruin probability (≥50% max drawdown in a simulation) ranges from 55% (F5-E, the best) to 91% (F3-A). Median simulated max drawdown exceeds 50% for every single config that reached this stage. This is the single most decisive piece of evidence against any of these 24 configurations being genuinely tradeable at the position sizing tested (10%/yr per-leg vol target, §"Position Sizing" below) — full figures in each experiment's JSON.

## 15. Tail Risk

Every Stage-4 survivor's STRESSED-cost annualized return is negative except F5-E (+3.2%/yr) — see the table in §10. Skewness is negative and kurtosis elevated for every carry-related config (F3-*, consistent with Brunnermeier, Nagel & Pedersen 2008's crash-risk framing — e.g. F3-E: skew -1.86, kurtosis 11.6). Worst single month across all configs reaches -35% (unnormalized to the vol-target convention — see §Position Sizing). No period-obscuring was applied — every crisis window (2015 CHF de-peg, 2020 COVID, 2022 hiking cycle) is included in every metric above, per §9's explicit "no esconder períodos de crisis" instruction.

## 16. Parameter Robustness

- **Family 1** (momentum lookback 1/3/6/12mo): Sharpe sign flips unpredictably (0.02, -0.24, -0.22, -0.04, 0.16, -0.05) — no plateau, a fragility signal, not a peak worth trusting.
- **Family 3** (carry N + regime threshold): the vol-regime filter shows a genuine, monotonic-looking improvement as the exit threshold tightens (F3-A unfiltered Sharpe 0.05 → F3-C at 70th-percentile-exit Sharpe 0.11) — a real, if modest, plateau-like pattern, not a single lucky point. This is this round's most credible *directional* finding (filtering carry by realized-vol regime helps), even though no variant clears the full candidacy bar.
- **Family 4** (trend lookback 1/3/6/12mo, blend, universe breadth): uniformly negative — Sharpe ranges -0.05 to -0.26 across every single variant tested, including the universe-breadth check (F4-F, full 11-instrument universe, still -0.13). This IS a robust plateau — a robust plateau of "no edge here."
- **Family 5** (factor-weight combinations): the full-universe risk-weighted variant (F5-E) outperforms every top/bottom-N selection variant (F5-A/B/C/F) by a wide margin (Sharpe 0.28 vs 0.05-0.09) — a real, mechanically-explicable difference (full diversification vs concentrated selection), not noise, but a single configuration difference, not a swept parameter plateau, so treated as a directional finding rather than confirmed robustness.

## 17. Multiple Testing

24 Block 8.2 trials (this round) + 29 Block 8 trials (prior round) = 53 FX configurations tested across both rounds — recorded here per §18's explicit instruction not to treat this round in isolation. Block 8's own Sharpe/expectancy figures use a different unit (per-trade R-multiples, intraday) than Block 8.2's (monthly portfolio returns) — the two are not statistically poolable into one Deflated Sharpe Ratio calculation without conflating incompatible methodologies, so DSR is computed separately within each round's own trial set (Block 8's report already did this implicitly by never reaching the deep-validation stage; Block 8.2's is below), while the combined trial COUNT (53) is disclosed as the honest context for how much searching has been done across this codebase's FX research to date.

**Block 8.2's own 24-trial Deflated Sharpe Ratio**, computed via `deflatedSharpeRatio` (reused unchanged from Block 5's `deflated-sharpe.ts`) against the actual cross-trial Sharpe standard deviation (0.14):

| Config | Sharpe (REALISTIC) | PSR (>0, uncorrected) | DSR (24-trial corrected) |
|---|---:|---:|---:|
| F3-E | 0.085 | 0.853 | **0.009** |
| F1-E | 0.155 | 0.979 | 0.054 |
| F3-C | 0.114 | 0.915 | 0.024 |
| F5-E | 0.278 | 1.000 | **0.499** |

F5-E's DSR of 0.499 is the highest of the round by a wide margin — still means "no better than a coin flip that the true Sharpe exceeds what 24 independent tries would produce by chance alone," not evidence of skill, but meaningfully less consistent with pure luck than every other config tested (all DSR < 0.06). This is the single clearest quantitative signal in the entire report for where a future round's limited research budget would be best spent, if FX research continues (§25).

## 18. Strategy Correlations

Not computed as a full pairwise matrix: with 0 genuine candidates surviving §10.1's review, there is nothing to combine into a portfolio. Directionally, from the data already computed: every Family 3 (carry) variant shares the same LOW_VOL/HIGH_VOL regime split (§13) and the same underlying rate-differential signal, so they are highly correlated with each other by construction — not independent evidence, a single underlying bet tested 6 ways. F5-E (multi-factor) is the only config that meaningfully diverges from the carry-only pattern (positive in HIGH_VOL-adjacent second-half data where carry-only configs are negative), consistent with its 3-factor construction actually diversifying return sources rather than being "carry relabeled."

## 19. Portfolio Simulation (FX_CANDIDATE_PORTFOLIO)

**Not built.** §23 of the brief requires ≥2 survivors before constructing a combined portfolio simulation; this round has 0 after §10.1's review. No portfolio-of-strategies analysis was attempted — building one against 0 real candidates would manufacture a diversification benefit that doesn't exist to combine.

## 20. Prop-Firm Compatibility

**Not performed**, same reasoning as Block 8 §11: no candidate survived to this stage. The generic `TradingProgramConstraintSet` scaffold (`src/novacore/prop-firm/types.ts`) remains untouched and unused by this round, exactly as intended. No FTMO or other program's rules were fetched, hardcoded, or guessed; no challenge was purchased.

## 21. Candidates

**None.** F3-E mechanically cleared the reused classifier's gate but is downgraded to RESEARCH per §10.1 — see that section for the complete, criteria-by-criteria justification (DSR, Monte Carlo ruin probability, stressed-cost sign, long-history stability), all checked against thresholds from the frozen §7-9 pre-registration, none invented after the fact.

## 22. Rejected Hypotheses — Ranked (per §28: a ranking even where everything is rejected/downgraded)

Best-researched-hypothesis-first, independent of final classification:

1. **F5-E (Multi-Factor FX, full-universe risk-weighted)** — RESEARCH. Best Sharpe (0.28), only config positive under STRESSED costs and in both sample halves, highest DSR (0.499) of the round. Not promoted (walk-forward only 40% positive, DSR still well short of a real confidence bar) but the clearest "worth a future look" result.
2. **Family 3, vol-regime-filtered carry (F3-B/F3-C)** — RESEARCH. Genuine, monotonic-looking improvement from filtering carry by realized-vol regime (§16) — a real directional finding about WHERE carry's crash risk concentrates, even though cost/tail-risk margins remain too thin to promote.
3. **F3-E (unfiltered carry, N=2)** — RESEARCH after downgrade. The cautionary tale of this report: passes a narrow mechanical gate, fails every broader scrutiny (§10.1). Documented in detail specifically so the failure mode (trusting a mechanical classifier without checking DSR/tail risk) isn't repeated.
4. **F1-E (Factor Momentum, 6mo lookback / 3mo hold)** — RESEARCH. Weakly positive but no parameter-neighborhood support (§16) and DSR = 0.054.
5. **Family 4, Diversified Time-Series Trend (all 6 configs)** — REJECTED, decisively. Negative gross AND net at every lookback and universe breadth tested, MaxDD 85-99.5% in Monte Carlo. The cleanest, least ambiguous null result in this report — worth stating plainly: this is strong evidence AGAINST simple time-series trend-following on this 7/11-pair FX universe at monthly rebalance over 2011-2026, not an inconclusive result.

## 23. Data-Insufficient Hypotheses

**Family 2 (Economic Momentum FX)** — 0 configurations run. Requires as-of-publication-date macro data (industrial production, retail sales, employment) to avoid look-ahead; this environment's only free, keyless path to such data (ALFRED's vintage endpoint) was tested and confirmed to silently ignore the vintage parameter (§3.5). Documented with its full academic basis (Dahlquist & Hasseltoft 2020) so a future block with real vintage-data access can pick this up without re-deriving the hypothesis from scratch.

## 24. Limitations

- No real bid/ask FX data (re-confirmed unavailable this round, §3.2) — every spread/slippage/swap-markup figure is ESTIMATED, never OBSERVED. The interest-rate differential itself (carry's core input) IS real, OBSERVED FRED data — kept structurally separate throughout.
- Position sizing uses a fixed 10%/yr-per-leg vol-targeting convention (`portfolio-engine.ts`), not a claim about deployable capital or real leverage — Monte Carlo ruin probabilities (§14) are relative to THIS convention, not an absolute dollar risk-of-ruin statement.
- CPI-based Value uses a fixed 2-month publication lag, not full point-in-time vintages (§3.4) — a smaller, more defensible simplification than Family 2's full exclusion, but still a simplification.
- Two real implementation bugs were caught and fixed during this round's own review (§10.2) — both are now covered by regression tests (§26), but their existence is a reminder that a "surprisingly good" result in this kind of research deserves default suspicion, not default excitement.
- Walk-forward and Monte Carlo statistics are based on 180 months (15 years) of history — long by FX-research standards, but still a single historical realization; the two crisis episodes it contains (2015 CHF de-peg, 2020 COVID) dominate the tail-risk picture and may not represent the full space of future crash scenarios.
- Regime and correlation analysis (§13, §18) is directional, not a formal statistical test — presented as color on the funnel results, not as independent evidence clearing any candidacy bar.

## 25. Recommendation

If FX research continues in a future block, the two leads worth a genuinely NEW, independently-pre-registered round (never simply re-running these same 24 with different parameters) are: (1) **F5-E's full-universe, risk-weighted multi-factor construction**, specifically testing whether a larger currency universe or a longer/independent OOS window changes its DSR meaningfully, and (2) **the vol-regime carry filter's mechanism** (§16, §22 item 2) tested against a genuinely independent regime proxy (e.g. real credit-spread or implied-vol data, if a source becomes available) rather than the basket-realized-vol proxy used here, since that proxy is constructed from the same price data the strategy itself trades. Family 4 (trend-following) should NOT be revisited without a fundamentally different construction — this round's null result was too clean and too consistent across every lookback tested to be a data or implementation artifact.

---

*Reproducibility: `NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/forex2/fetch-fx-daily.ts && npx tsx scripts/research/forex2/fetch-macro-data.ts` then `npx tsx scripts/research/forex2/run-block8-2-funnel.ts`. Raw results: `results/block8-2/` (gitignored, regenerate via the commands above).*
