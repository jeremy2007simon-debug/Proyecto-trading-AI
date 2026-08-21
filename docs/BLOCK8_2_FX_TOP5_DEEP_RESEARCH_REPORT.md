# Block 8.2 — FX Top-5 Deep Research

> **Status note:** Sections 1-9 below (data audit, hypotheses, universe, cost-model design, funnel design) are the **frozen pre-registration** for this research round — written and committed before any Family 1-5 signal code existed and before any backtest ran. Sections 10+ are filled in only after the funnel completed, and nothing in 1-9 was edited afterward (see git history: the pre-registration commit precedes every experiment-code commit on this branch).

## 1. Executive Summary

*(filled in after §10-25 are complete — see end of document)*

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

*(Sections 10-25 continue below once the funnel has run — see §1 Executive Summary and the final Decision line for the outcome.)*
