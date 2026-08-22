# Block 9 — Strategy #2 Discovery & Pre-Registration: Literature Review Report

> **Role note:** this report is a literature review and pre-registration exercise, not a backtest report. The mandate was to find the best candidate FAMILIES for a second, genuinely independent NovaCore strategy through external research — not to find "the prettiest backtest." Per this block's own explicit STOP instruction (§8, §19, §29 of the brief), **zero new backtests were executed against price data in this block.** Every number below that looks like a performance figure is either (a) transcribed unchanged from a previously frozen NovaCore report, or (b) a range reported in the cited external literature, explicitly labeled as such and never presented as this project's own result.

## Decision

**STRATEGY #2 TOP-5 PRE-REGISTERED — WAITING FOR REVIEW.** No backtests run. R3-B remains REJECTED and untouched. RS3M, Block 6, the Routine, and Paper are unmodified (verified in §9 below).

## 0. Where This Picks Up

NovaCore's only Paper-connected strategy remains `RS3M_CANDIDATE_V1`, hash `1c28b57c`, unchanged since Block 6. Block 8.3 found exactly one mechanical US-index survivor (R3-B); Block 8.4 independently re-audited it and **rejected** it — not for any bug, look-ahead, or cost failure (all clean), but because its Deflated Sharpe Ratio collapses from 0.96 (Block 8.3's own narrow 24-trial pool) to 0.23 once honestly evaluated against this project's full cumulative research history (≥154 trials, reconciled in §2 below). Two real parameter/regime-type cliffs (`entryRsiThreshold`, regime-type selection) compounded that finding. Per this block's explicit brief: **R3-B was not touched, not optimized, not used as a template, and no R3-C/R3-D reactive variant was created.** This block starts a structurally different search — new families, new economic rationale, new markets/timeframes where useful — rather than re-litigating R3-B.

## 1. External Research Methodology

Research was conducted via targeted queries against academic/practitioner sources (SSRN, NBER, ScienceDirect/JFE-JFin-RFS-hosted papers, AFA/AEA conference proceedings, Federal Reserve working papers, AQR/Man Group/Alpha Architect research pages, and official CBOE/Alpaca/FRED documentation for data/execution feasibility questions), prioritizing peer-reviewed journal articles and NBER/SSRN working papers over blogs or secondary summaries. No YouTube, TikTok, SEO blog, guru, or unsourced trading-strategy content was used as evidence — where such sources surfaced in a search, they were discarded, not cited. See §26 for full per-claim sourcing with what each paper actually supports and its limitations.

**Peer-reviewed vs. working paper vs. industry research**, tagged per citation in §26:
- **Peer-reviewed (published journal):** Journal of Finance, Journal of Financial Economics, Review of Financial Studies, Management Science, American Economic Review, Financial Analysts Journal, Quarterly Journal of Economics/Finance.
- **Working paper / not-yet-published:** several SSRN/job-market papers, cited but flagged as such — not given the same weight as a published, peer-reviewed result.
- **Industry research:** AQR, Man Group, Alpha Architect — used for practitioner corroboration and long-sample replications (e.g., AQR's century-long trend-following series), never as the sole basis for a grade above B.

## 2. Cumulative Research Trial Ledger

Full detail: `results/block9/cumulative-trial-ledger.json`.

This project's own Block 8.4 report established a **≥154-trial** cumulative pool for multiple-testing correction (the figure that sank R3-B's DSR from 0.96 to 0.23). This block reconciles that figure block-by-block against the frozen reports and the NovaCore Research Lab adapter (`src/novacore/research-lab/adapters/block-research-adapter.ts`) rather than treating it as an assertion:

| Block | Family | Configurations | Source |
|---|---|---:|---|
| 4 | 5 original Strategy Manager strategies | 5 | `BLOCK4_BACKTESTING_REPORT.md` |
| 4.5 | Deep validation of the 2 Block-4 survivors | 42+ | `BLOCK4_5_STRATEGY_RESEARCH_REPORT.md` |
| 5 | 8-family ETF rotation discovery (→ RS3M) | 24 | `BLOCK5_STRATEGY_DISCOVERY_REPORT.md` |
| 8 | 5-family intraday FX research | 29 | `BLOCK8_FOREX_RESEARCH_REPORT.md` |
| 8.2 | FX Top-5 deep research | 24 | `BLOCK8_2_FX_TOP5_DEEP_RESEARCH_REPORT.md` |
| 8.3 | US-Index Top-5 deep research (→ R3-B) | 30 | `BLOCK8_3_US_INDEX_TOP5_DEEP_RESEARCH_REPORT.md` |
| 8.4 | R3-B independent verification (audit, not new discovery) | 0 new | `BLOCK8_4_R3B_INDEPENDENT_VERIFICATION_REPORT.md` |
| **9 (this block)** | **Literature review, Top-5 selection, pre-registration** | **0** | this report |

**5 + 42 + 24 + 29 + 24 + 30 = 154** — the ≥154 figure Block 8.4 used is fully reconciled, not an unexplained number, and this ledger carries it forward **unchanged** as the floor for any future Strategy #2 DSR computation. Per §9 of this block's brief, the pool is never artificially shrunk to flatter a future result. **New backtests executed in Block 9: 0.**

## 3. Literature Map (Families A-T)

Full detail, all 20 letters with evidence grade, crowding/decay/implementation-difficulty/data-quality/turnover/correlation ratings and a verdict: `results/block9/literature-map.json`. Summary:

| Letter | Family | Grade | Verdict |
|---|---|:-:|---|
| A | Time-series momentum/trend | A | Not advanced — too close to RS3M (already tested via Block 5/8.3, correlated 0.90-0.95) |
| B | Cross-sectional momentum | A | Not advanced — RS3M **is** this family by construction |
| C | Short-term reversal | B | **Top-5 (#5)** |
| D | Overnight/intraday decomposition | A | **Top-5 (#1)** |
| E | Volatility risk premium | A | **Top-5 (#2)**, tail-risk gated |
| F | Defensive/low-beta/low-vol | A | **Top-5 (#4)** |
| G | Equity seasonality (general) | C | Not advanced — folded into M, weaker/decayed subset |
| H | Cross-asset signals | B | Not advanced — merged with O, deferred to a future single-signal overlay |
| I | Market breadth | B | Not advanced — real evidence, but data-source and "becomes another RS3M filter" risk |
| J | Volatility timing | B | Not advanced — **already tested** (Block 8.3 Family 1), 0.79-0.82 correlated with RS3M |
| K | Trend + crisis alpha | A | Not advanced — needs futures/cross-asset infra this project doesn't have; equity-only version degenerates to A |
| L | Gap/overnight effects | B | Not advanced — folded into D; a fixed-gap variant already REJECTED in Block 5 |
| M | Turn-of-month/calendar | B | **Top-5 (#3)**, HIGH decay risk flagged |
| N | Earnings/PEAD | A (historical) / C (current) | Not advanced — DATA_INSUFFICIENT (no free point-in-time consensus-estimate source) |
| O | Macro/rates conditioning | B | Not advanced — merged with H |
| P | Dispersion | C | Not advanced — needs multi-name options infra Alpaca doesn't offer |
| Q | Quality/value/momentum factors | A | Not advanced — subsumed by F on this project's ETF-only universe |
| R | Options-implied information | B | Not advanced — deferred as a future signal enhancement to E |
| S | Futures-based index strategies | A (structural) | Not advanced — RESEARCH_ONLY, no futures broker; would just be a wrapper on already-considered families |
| T | Other (ML/AI-discovered anomalies) | N/A | Explicitly out of scope this block per §17 |

**The correct reading of this table is not "15 families are bad."** Several (A, B, J, K, Q) are excluded specifically *because* the evidence is strong but the resulting strategy would not diversify RS3M or duplicates work this project already did — exactly the discipline §6 and §10 of the brief ask for. Others (N, P, S) are excluded on data/infrastructure feasibility, documented rather than silently dropped, per §12/§13.

## 4. Priority Research Areas (§7) — Findings

**A. Overnight/intraday decomposition:** strong, replicated, economically-grounded (structural + information-diffusion) evidence that US index overnight and intraday returns behave as near-opposite regimes over multi-decade samples (Lou/Polk/Skouras 2019; Hendershott/Livdan/Rösch 2020). Persistence after realistic costs is a real open question this project's own pre-registration (§ below) is designed to test honestly, not assume. **Advanced.**

**B. Volatility risk premium:** well-established academic result (Carr & Wu 2009; Bollerslev/Tauchen/Zhou 2009) that implied variance systematically exceeds subsequently realized variance. Naive harvesting (unhedged short volatility) carries a well-documented catastrophic left tail (the Feb-2018 "Volmageddon" episode that destroyed the XIV ETN is the canonical case study — a >90% single-day loss for short-vol-ETP holders). This project will only pre-register a **defined-risk** implementation (put spread or covered/stopped short-vol-ETP position), per §16's own instruction not to accept hidden ruin risk for a headline Sharpe. Options infrastructure: **Alpaca now supports single- and multi-leg options trading in Paper (enabled by default) as of this project's current environment** — confirmed via this block's own research, so this family does not need to wait on a broker upgrade. **Advanced, tail-risk gated.**

**C. Seasonality/rebalancing flows:** turn-of-month is the best-evidenced calendar effect (Lakonishok & Smidt 1988; McConnell & Xu 2008), with a plausible institutional-flow rationale (payroll/pension rebalancing concentrated at month boundaries). McLean & Pontiff (2016) is the decisive caveat: anomalies broadly, and this one specifically per practitioner re-examinations, show real post-publication decay. **Advanced, with decay risk as the headline falsification concern**, not treated as a settled effect.

**D. Short-term reversal:** Da, Liu & Schaumburg (2014) is the most rigorous decomposition available and explicitly flags that transaction costs threaten the standard reversal strategy, especially in small/illiquid names. This project restricts the test to the 4 most liquid US index ETFs specifically to give the effect its best chance of surviving costs — a deliberate, disclosed design choice, not a claim that the broader small-cap reversal literature applies unchanged here. **Advanced, with cost survival as the explicit falsification test.**

**E. Cross-asset information:** real, citable evidence (Gilchrist & Zakrajšek 2012 on credit spreads; Johnson on the VIX term structure) that rates/credit/vol markets carry information about subsequent equity returns. Per the brief's own instruction not to build a 40-variable macro model, this is **not advanced as a standalone family this round** — flagged as a future single-signal overlay candidate, most likely layered onto E (VRP) or D (overnight), not tested as its own 20-configuration budget item.

**F. Market breadth:** Zaremba et al. (2021) is real, peer-reviewed evidence that breadth carries information beyond simple trend/momentum. **Not advanced** this round for two disclosed reasons: (1) full-market breadth data (all NYSE/Nasdaq advancers/decliners) is largely index-provider-proprietary or paywalled — this project's free data sources (Yahoo, FRED) don't reach it cleanly; (2) the brief's own §7.F warning that breadth risks quietly becoming "just another RS3M filter" rather than an independent return source is a real methodological risk this project takes seriously rather than working around.

**G. Defensive equity:** Ang/Hodrick/Xing/Zhang (2006) and Frazzini & Pedersen (2014) are among the most-replicated results in this entire literature review — multiple markets, multiple decades, a coherent leverage-constraint explanation. **Advanced.**

**H. Futures:** the structural case (24h access, capital efficiency, no ETF-creation friction) is real and well-documented at the exchange level, but Alpaca does not support futures trading — a genuine infrastructure gap, documented per the brief's own instruction not to discard the idea solely for that reason, but correctly scoped as a **future roadmap item**, not a Top-5 slot, since implemented on equity indices alone it collapses back into family A/K (already excluded for RS3M redundancy).

## 5. Top 5 Selected Families

Full scoring detail: `results/block9/evidence-ranking.json`. Data feasibility detail: `results/block9/data-feasibility.json`.

### #1 — Overnight / Intraday Return Decomposition
- **Economic rationale:** structural (index/ETF creation-unit flow concentrated near the close) + information diffusion (news accumulates overnight, is priced at the open) + institutional overnight risk-transfer. Category: *structural / information diffusion*.
- **Evidence grade:** A.
- **Key papers:** Lou, Polk & Skouras (2019), *"A Tug of War: Overnight versus Intraday Expected Returns,"* Journal of Financial Economics (peer-reviewed) — documents a persistent negative correlation between overnight and subsequent intraday returns across decades of US equity data. Hendershott, Livdan & Rösch (2020), *"Asset Pricing: A Tale of Night and Day,"* Journal of Financial Economics (peer-reviewed) — links the overnight/day split to information-processing and risk-based explanations. Cliff, Cooper & Gulen (2008), working paper — an earlier, foundational documentation of the raw overnight-vs-intraday return gap in US indices.
- **Markets:** SPY, QQQ (extendable to IWM/DIA).
- **Timeframe:** daily entries/exits — a fundamentally different holding period from RS3M's monthly rebalance.
- **Data required:** daily open/close (already available via Alpaca/Yahoo — no new source).
- **Execution requirements:** market-on-close and market-on-open order types; Alpaca-compatible.
- **Expected turnover:** HIGH (potentially every trading day).
- **Cost sensitivity:** the main open question — daily turnover means even a few bps of spread/slippage per round trip compounds quickly; this project's pre-registration requires the strategy clear realistic SPY/QQQ costs, not just gross returns.
- **Tail risk:** overnight gap risk (a position held overnight can gap against it with no ability to exit intraday) — real but bounded (no leverage, no options in this family's base design).
- **Expected correlation with RS3M:** LOW (different holding mechanism entirely — RS3M never trades intraday).
- **Crowding risk:** MEDIUM (widely studied, but changes daily and isn't a single static factor to arbitrage away).
- **Decay risk:** LOW-MEDIUM.
- **Implementation difficulty:** LOW.
- **Why it deserves testing:** the single most-replicated, most economically-distinct, and cheapest-to-test-with-existing-data family in this entire review.
- **Main falsification risk:** the effect could easily be gross-positive but net-negative after this project's own realistic SPY/QQQ cost model — exactly what Block 8's FX research found for 12/29 configurations there. The pre-registration treats this as the primary kill criterion, not an afterthought.

### #2 — Volatility Risk Premium
- **Economic rationale:** risk premium — option sellers are compensated for bearing crash/variance risk that buyers pay to offload; behavioral overpayment for "insurance" adds to the effect. Category: *volatility premium / risk premium*.
- **Evidence grade:** A.
- **Key papers:** Carr & Wu (2009), *"Variance Risk Premia,"* Review of Financial Studies (peer-reviewed) — the foundational result that variance swap rates (a proxy for implied variance) systematically exceed subsequently realized variance. Bollerslev, Tauchen & Zhou (2009), *"Expected Stock Returns and Variance Risk Premia,"* Review of Financial Studies (peer-reviewed) — links the VRP to subsequent market-return predictability. Bondarenko (2014), *"Why Are Put Options So Expensive?"*, Quarterly Journal of Finance (peer-reviewed) — documents the persistent overpricing of index puts specifically.
- **Markets:** SPY / VIX-linked instruments.
- **Timeframe:** weekly-to-monthly option/ETP roll cycle.
- **Data required:** VIX level (FRED `VIXCLS`, free/keyless, confirmed this block; CBOE's own public CSV as a cross-check), realized volatility (computed from existing SPY bars), and — for the options-spread implementation path — an options chain (Alpaca Options Data API).
- **Execution requirements:** either (a) a long/short position in an exchange-traded volatility ETP (e.g., SVXY/VXX, tradeable as ordinary equities — no new broker), or (b) a defined-risk SPY options spread via Alpaca's multi-leg options support (confirmed available in Paper as of this block's research). **This block does not choose between the two paths — that decision is deferred to the actual design phase, pre-registered as an open question.**
- **Expected turnover:** LOW-MEDIUM.
- **Cost sensitivity:** MEDIUM — ETP expense ratios/borrow costs, or options bid/ask spread, both real and non-trivial.
- **Tail risk:** **HIGH in its naive form.** The Feb-2018 XIV/SVXY collapse (>90% single-day loss for short-vol-ETP holders when VIX spiked) is the canonical cautionary case and is cited here explicitly per §16's instruction not to let a high Sharpe hide ruin risk. **This is why the pre-registration mandates a defined-risk structure as a condition of testing, not an optional enhancement.**
- **Expected correlation with RS3M:** MEDIUM (both have long-equity-market exposure in normal regimes; the VRP position's real differentiation is in its behavior during vol spikes, where it can be sharply negative — the opposite tail behavior from RS3M, which is worth documenting even though it isn't a "the more correlation the better" case).
- **Crowding risk:** MEDIUM-HIGH (short-vol strategies are widely known and have been for over a decade).
- **Decay risk:** LOW (the VRP has persisted across many market cycles since Carr & Wu's original sample).
- **Implementation difficulty:** MEDIUM (options mechanics, margin, defined-risk structuring all add real complexity RS3M/R3-B never needed).
- **Why it deserves testing:** one of the most robust, longest-lived, most economically coherent risk premia in the literature — but only worth this project's time if tested with the risk controls its own well-documented tail history demands.
- **Main falsification risk:** a defined-risk structure caps the upside that makes naive VRP harvesting look attractive in backtests — the pre-registered test must show the STRUCTURED version still clears a positive-net-edge bar, not just cite the naive literature figure.

### #3 — Turn-of-Month / Calendar Seasonality
- **Economic rationale:** institutional rebalancing flows (payroll investment, pension/401(k) contributions, and month-end portfolio rebalancing concentrate buying pressure around month boundaries) + structural. Category: *rebalancing flows / institutional*.
- **Evidence grade:** B.
- **Key papers:** Lakonishok & Smidt (1988), *"Are Seasonal Anomalies Real? A Ninety-Year Perspective,"* Review of Financial Studies (peer-reviewed) — the original long-sample documentation. McConnell & Xu (2008), *"Equity Returns at the Turn of the Month,"* Financial Analysts Journal (peer-reviewed, practitioner-oriented journal) — confirms and extends the effect through the mid-2000s, finding essentially all of the market's positive excess return concentrated in the 4-day turn-of-month window. McLean & Pontiff (2016), *"Does Academic Research Destroy Stock Return Predictability?"*, Journal of Finance (peer-reviewed) — the general decay mechanism (publication accelerates arbitrage) directly relevant to this specific, decades-old, heavily-publicized effect.
- **Markets:** SPY/QQQ/IWM/DIA.
- **Timeframe:** monthly-recurring, few-day holding window — different from RS3M's full-month hold.
- **Data required:** trading-day calendar (already available via Block 6's NYSE-calendar utility, reused read-only) + daily OHLC.
- **Execution requirements:** simple calendar-triggered market orders; Alpaca-compatible.
- **Expected turnover:** LOW.
- **Cost sensitivity:** LOW (few trades/year, large liquid ETFs).
- **Tail risk:** LOW (long-only, brief holding window, no leverage).
- **Expected correlation with RS3M:** LOW (a calendar trigger is a completely different signal source from a 3-month cross-sectional momentum rank).
- **Crowding risk:** MEDIUM-HIGH (this is one of the most widely known calendar anomalies).
- **Decay risk:** **HIGH** — flagged explicitly, this family's own key papers are the ones most directly implicated in the "does academic research destroy predictability" literature.
- **Implementation difficulty:** LOW.
- **Why it deserves testing:** cheap to test, genuinely low correlation with RS3M, and a clean, pre-registerable falsification design (does the effect still exist in the MOST RECENT decade of this project's own data, not just historically?).
- **Main falsification risk:** the single most likely Top-5 family to fail on recency — its own literature warns it may already be substantially arbitraged away. The pre-registration requires a dedicated recent-subperiod check, not just a full-sample average that could hide a dead effect.

### #4 — Defensive / Low-Volatility Equity
- **Economic rationale:** institutional (leverage-constrained investors bid up high-beta/high-volatility names seeking return without leverage, depressing their risk-adjusted returns and correspondingly lifting low-beta names') + behavioral (lottery-preference demand for high-volatility stocks). Category: *institutional / behavioral*.
- **Evidence grade:** A.
- **Key papers:** Ang, Hodrick, Xing & Zhang (2006), *"The Cross-Section of Volatility and Expected Returns,"* Journal of Finance (peer-reviewed) — the foundational low-volatility-anomaly documentation. Frazzini & Pedersen (2014), *"Betting Against Beta,"* Journal of Financial Economics (peer-reviewed) — the leverage-constraint theory and a factor shown positive "in virtually every equity market studied." Baker, Bradley & Wurgler (2011), *"Benchmarks as Limits to Arbitrage,"* Financial Analysts Journal (peer-reviewed) — the institutional-benchmarking explanation for why the anomaly persists despite being well known.
- **Markets:** SPY/QQQ/IWM/DIA (in-house low-vol/low-beta tilt) or listed factor ETFs (USMV, SPLV) if a broader universe is later wanted.
- **Timeframe:** monthly-to-quarterly rebalance (a risk-based tilt, not a fast signal).
- **Data required:** daily OHLC (already available) for realized-vol/beta estimation.
- **Execution requirements:** simple long-only rebalance; Alpaca-compatible.
- **Expected turnover:** LOW.
- **Cost sensitivity:** LOW.
- **Tail risk:** LOW-MEDIUM (a defensive tilt should, if anything, reduce left-tail exposure relative to the broad market — the opposite risk profile concern from family E).
- **Expected correlation with RS3M:** MEDIUM — both are long-only equity strategies drawing from an overlapping universe, so some correlation is expected; the differentiation is in what drives selection (risk-based ranking vs. momentum rank), which the pre-registration will measure directly rather than assume.
- **Crowding risk:** MEDIUM (widely known, large AUM in low-vol ETFs today).
- **Decay risk:** LOW (persisted across Frazzini & Pedersen's multi-market, multi-decade sample without visible decay).
- **Implementation difficulty:** LOW.
- **Why it deserves testing:** the most-replicated result in this review outside of momentum itself; a legitimate risk-based (not signal-timing) complement to RS3M.
- **Main falsification risk:** on only a 4-ETF universe, a "low-vol tilt" has limited cross-sectional dispersion to work with — the effect may simply not have room to express itself without a broader stock universe, which is itself a real, disclosed design constraint, not a result yet.

### #5 — Short-Term Reversal (SPY/QQQ/IWM/DIA only)
- **Economic rationale:** liquidity provision (a trader providing liquidity after a sharp one-day move is compensated as fire-sale/urgent order flow reverts) + market microstructure overreaction to non-fundamental price pressure. Category: *liquidity provision / market microstructure*.
- **Evidence grade:** B.
- **Key papers:** Da, Liu & Schaumburg (2014), *"A Closer Look at the Short-Term Return Reversal,"* Management Science (peer-reviewed) — decomposes the standard reversal strategy and finds the surviving, genuinely-predictive component is reaction to non-fundamental price moves specifically (not cash-flow news). Lehmann (1990), *"Fads, Martingales, and Market Efficiency,"* Quarterly Journal of Economics (peer-reviewed) — the original weekly-reversal documentation. Nagel (2012), *"Evaporating Liquidity,"* Review of Financial Studies (peer-reviewed) — ties reversal-strategy profitability to liquidity-provider capital constraints (i.e., the strategy is a liquidity-provision risk premium, with time-varying returns tied to funding conditions, most visible around 2008).
- **Markets:** SPY/QQQ/IWM/DIA (deliberately restricted to the most liquid instruments — see falsification risk).
- **Timeframe:** 1-5 day holding period.
- **Data required:** daily OHLC (already available).
- **Execution requirements:** simple market orders on a large-move trigger; Alpaca-compatible.
- **Expected turnover:** HIGH.
- **Cost sensitivity:** **HIGH** — the central open question for this family, per Da/Liu/Schaumburg's own cost warning.
- **Tail risk:** MEDIUM (a reversal trade taken right after a large move can be wrong exactly when moves are largest — the "catching a falling knife" risk is real and disclosed).
- **Expected correlation with RS3M:** LOW (days-scale mean-reversion is close to economically opposite RS3M's months-scale trend-following).
- **Crowding risk:** MEDIUM (well known, but liquidity-provision strategies self-limit crowding by construction — too much capital chasing the same reversal compresses the very spread it harvests).
- **Decay risk:** MEDIUM.
- **Implementation difficulty:** MEDIUM.
- **Why it deserves testing:** genuinely opposite economic mechanism and holding period from every other family this project has tested to date, restricted specifically to the segment (large, liquid, low-spread ETFs) where the literature's own cost warning is least likely to bind.
- **Main falsification risk:** the same literature that supports this family also warns most directly that its edge shrinks or vanishes once realistic costs are applied — precisely the failure mode Block 8's FX research (12/29 gross-positive, 0/29 net-positive) already demonstrated in a different market. This is treated as the single most likely Top-5 family to reach REJECTED, not talked around.

## 6. Selection Score

See `results/block9/evidence-ranking.json` for the full weighted breakdown. Weights (fixed before scoring, unchanged after, per §11's own instruction): Academic evidence 20, Economic rationale 15, Data quality 15, Execution realism 10, Cost robustness 10, RS3M diversification 15, Parameter simplicity 10, Tail-risk profile 5 (total 100). Adopted unchanged from the brief's own example — see the JSON file's `weightJustification` field for why. Totals: D=91, M=89, F=88, C=79, E=76. Tail risk is additionally enforced as a hard gate (§16), independent of its 5-point score weight — E only clears that gate because its pre-registration mandates a defined-risk structure as a condition of testing, not an optional refinement.

## 7. Data Feasibility

See `results/block9/data-feasibility.json`. All five selected families are **READY** using data sources this project already has confirmed access to (Alpaca, Yahoo, FRED) or newly confirmed this block (CBOE's public VIX CSV; Alpaca's options support). No credentials were invented and no scraping that would violate provider terms was proposed. Families excluded on data grounds (N — PEAD; partially I — Market Breadth) are documented with the specific gap, not silently dropped.

## 8. Execution Feasibility

| Family | Classification |
|---|---|
| D — Overnight/Intraday | `ALPACA_COMPATIBLE` |
| E — Volatility Risk Premium | `ALPACA_COMPATIBLE` (via ETP or Alpaca multi-leg options, confirmed this block — no longer `OTHER_BROKER_REQUIRED`) |
| M — Turn-of-Month | `ALPACA_COMPATIBLE` |
| F — Defensive/Low-Vol | `ALPACA_COMPATIBLE` |
| C — Short-Term Reversal | `ALPACA_COMPATIBLE` |
| S — Futures (excluded from Top-5, documented) | `OTHER_BROKER_REQUIRED` |
| P — Dispersion (excluded) | `RESEARCH_ONLY` |
| N — PEAD (excluded) | `RESEARCH_ONLY` (data, not broker, is the blocker) |

This is architecture documentation only — **no broker is connected, no execution code is added, in this block.**

## 9. Time Horizon

RS3M is monthly. Deliberately, none of the Top-5 is another monthly rotation: D and C are daily-to-multiday, E is weekly-to-monthly (options/ETP roll), M is a few-day monthly-recurring window, F is monthly-to-quarterly. This spread of horizons is itself part of the diversification case, not an accident.

## 10. Return Expectations

No CAGR is forecast for any family — per §15's explicit instruction. Published historical evidence ranges (never this project's own expected result, and never re-derived here):

- **D (Overnight/Intraday):** Lou/Polk/Skouras and related studies document the overnight-return component of US index returns as historically substantial and the intraday component as historically flat-to-negative over multi-decade samples — **published evidence only; requires independent replication under this project's own realistic cost model before any figure is trusted.**
- **E (VRP):** Carr & Wu-style variance risk premium estimates are typically reported as a modest-but-persistent negative premium (implied > realized) on broad equity indices across their sample — **requires independent replication, and this project's defined-risk structuring will further reduce whatever the naive figure shows.**
- **M (Turn-of-Month):** McConnell & Xu (2008) report the turn-of-month window historically capturing effectively all of the market's average positive return in their sample — **explicitly flagged HIGH decay risk; requires independent replication on recent data specifically, not just historical average.**
- **F (Defensive/Low-Vol):** Frazzini & Pedersen (2014) report the BAB factor positive in "virtually every equity market studied" in their multi-decade, multi-market sample — **requires independent replication on this project's specific 4-ETF universe, which is a narrower test than the original cross-sectional study.**
- **C (Short-Term Reversal):** Da/Liu/Schaumburg report a standard reversal strategy's raw profitability, but explicitly flag transaction costs as a major offset — **requires independent replication under realistic large-cap-ETF costs specifically, which the original studies (often broader-universe) did not isolate.**

## 11. Tail Risk First

Per §16, no family was screened on Sharpe alone. E (VRP) is the one family in this review with a well-documented catastrophic-tail history (Feb-2018 Volmageddon) and is gated behind a mandatory defined-risk structure as a condition of even being tested, not merely noted as a caveat. D and C carry ordinary (not hidden) gap/adverse-move risk consistent with any daily-turnover long/short equity strategy and are not leveraged. F and M are the lowest-tail-risk families in the Top-5 by construction (long-only, no leverage, brief or risk-reducing exposure).

## 12. ML / AI

Not used, and not evaluated, in this block. Per §17: no deep learning, LLM-based trading, or reinforcement learning was considered as a candidate family. If an ML-based approach is investigated in a future, separate block, it will be required to demonstrate why it beats the simple rule-based version of the same idea — not evaluated on backtest performance alone.

## 13. Replication Risk (§27) — Per Top-5 Family

| Question | D | E | M | F | C |
|---|---|---|---|---|---|
| Independent evidence exists? | Yes (2+ papers, different authors) | Yes (2+ papers, different authors) | Yes (2+ papers, different authors) | Yes (3+ papers, different authors) | Yes (2+ papers, different authors) |
| Published many years? | Yes (2008-2020 span) | Yes (2009-2014 span, ongoing) | Yes (1988-2008 span) | Yes (2006-2014 span) | Yes (1990-2014 span) |
| Decay after publication? | Not clearly established either way | Not clearly established (persists across cycles) | **Yes — this project's own headline falsification concern** | Not clearly established | Plausible, per the same cost-erosion literature |
| Depends on microcaps? | No | No | No | No | No — deliberately restricted to large/liquid ETFs |
| Depends on unrealistic costs? | Untested here — this is the pre-registered kill criterion | Untested here — defined-risk structure reduces raw edge, tested honestly | No (low turnover) | No (low turnover) | Untested here — this is the pre-registered kill criterion |
| Depends on shorting? | No (base design is long/flat) | Yes (or long puts) — structural to the family | No | No | Possible (short side of reversal) — flagged |
| Depends on options? | No | **Yes, for one of two execution paths** | No | No | No |
| Depends on expensive datasets? | No | No (VIX/FRED free) | No | No | No |
| Look-ahead risk? | Low (open/close are realized, not forecast) | Low (VIX is realized at time of use) | Low (calendar is known in advance, deterministic) | Low | Low |
| Survivorship bias? | No (index ETFs, not a stock-picking universe) | No | No | No | No |
| Publication bias? | Plausible (a well-cited literature could over-represent positive findings) | Plausible | **Most plausible of the five — explicitly why it's ranked #3, not #1** | Plausible | Plausible |

## 14. Source Quality Appendix

| Claim | Title | Authors | Year | Journal/Source | Type | What it supports | Limitation |
|---|---|---|---|---|---|---|---|
| Overnight/intraday split | A Tug of War: Overnight versus Intraday Expected Returns | Lou, Polk, Skouras | 2019 | Journal of Financial Economics | Peer-reviewed | Persistent overnight/intraday return divergence in US equities | US-centric sample; does not itself model realistic ETF trading costs |
| Overnight/intraday split | Asset Pricing: A Tale of Night and Day | Hendershott, Livdan, Rösch | 2020 | Journal of Financial Economics | Peer-reviewed | Risk/information-based explanation for the split | Explanatory, not a standalone trading-cost-net backtest |
| Overnight/intraday split | Return Differences between Trading and Non-Trading Hours | Cliff, Cooper, Gulen | 2008 | Working paper | Working paper | Earlier documentation of the raw effect | Not peer-reviewed; superseded in rigor by the two above |
| Variance risk premium | Variance Risk Premia | Carr, Wu | 2009 | Review of Financial Studies | Peer-reviewed | Implied variance systematically exceeds realized variance | Studied via variance swaps, not directly SPY-option-spread P&L |
| Variance risk premium | Expected Stock Returns and Variance Risk Premia | Bollerslev, Tauchen, Zhou | 2009 | Review of Financial Studies | Peer-reviewed | VRP predicts subsequent aggregate equity returns | Predictive relationship, not itself a full trading strategy spec |
| Put overpricing | Why Are Put Options So Expensive? | Bondarenko | 2014 | Quarterly Journal of Finance | Peer-reviewed | Persistent index-put overpricing | Index-level finding; single-name behavior can differ |
| Turn-of-month | Are Seasonal Anomalies Real? A Ninety-Year Perspective | Lakonishok, Smidt | 1988 | Review of Financial Studies | Peer-reviewed | Long-sample turn-of-month documentation | Sample ends well before this project's own data window |
| Turn-of-month | Equity Returns at the Turn of the Month | McConnell, Xu | 2008 | Financial Analysts Journal | Peer-reviewed (practitioner journal) | Confirms/extends effect through mid-2000s | Practitioner-journal, not a top academic-finance journal; still peer-reviewed |
| Anomaly decay | Does Academic Research Destroy Stock Return Predictability? | McLean, Pontiff | 2016 | Journal of Finance | Peer-reviewed | General post-publication decay mechanism | A general finding applied here by inference to turn-of-month specifically, not a TOM-specific re-test |
| Reversal decomposition | A Closer Look at the Short-Term Return Reversal | Da, Liu, Schaumburg | 2014 | Management Science | Peer-reviewed | Isolates the genuinely predictive component of reversal; flags cost sensitivity | Primary sample skews toward broader/smaller-cap universe than this project's 4-ETF test |
| Reversal (original) | Fads, Martingales, and Market Efficiency | Lehmann | 1990 | Quarterly Journal of Economics | Peer-reviewed | Original weekly-reversal documentation | Older sample period, pre-modern market structure |
| Reversal & liquidity | Evaporating Liquidity | Nagel | 2012 | Review of Financial Studies | Peer-reviewed | Ties reversal profitability to liquidity-provider capital/funding constraints | Time-varying-returns finding, not a fixed expected edge |
| Low-vol anomaly | The Cross-Section of Volatility and Expected Returns | Ang, Hodrick, Xing, Zhang | 2006 | Journal of Finance | Peer-reviewed | Foundational low-volatility anomaly documentation | US-focused original sample (later work extends internationally) |
| Betting Against Beta | Betting Against Beta | Frazzini, Pedersen | 2014 | Journal of Financial Economics | Peer-reviewed | Leverage-constraint theory; positive in most markets studied | A market-neutral long/short factor construction, not directly this project's proposed long-only tilt |
| Low-vol persistence | Benchmarks as Limits to Arbitrage | Baker, Bradley, Wurgler | 2011 | Financial Analysts Journal | Peer-reviewed (practitioner journal) | Institutional-benchmarking explanation for persistence | Explanatory, not itself a backtest |
| PEAD (excluded) | Post-Earnings-Announcement Drift | Bernard, Thomas | 1989 | Journal of Accounting Research | Peer-reviewed | Original PEAD documentation | Sample far predates this project's data window; magnitude has since shrunk (see next row) |
| PEAD decay (excluded) | A Review of the Post-Earnings-Announcement Drift | Fink | 2020 | Working paper / literature survey | Working paper | Surveys evidence that PEAD magnitude has shrunk over time | Survey, not a single new empirical result |
| Market breadth (excluded) | Herding for Profits: Market Breadth and the Cross-Section of Global Equity Returns | Zaremba, Kizys, Aharon, Umar | 2021 | International Review of Financial Analysis | Peer-reviewed | Breadth adds information beyond trend/momentum measures | Global cross-section design; US-only, free-data replication is the open gap here |
| Credit/macro (excluded) | Credit Spreads and Business Cycle Fluctuations | Gilchrist, Zakrajšek | 2012 | American Economic Review | Peer-reviewed | Credit spreads predict real economic activity | A macro-forecasting result, not itself an equity-timing trading rule |
| Century of trend (context) | A Century of Evidence on Trend-Following Investing | Hurst, Ooi, Pedersen (AQR) | 2017 | AQR white paper | Industry research | Long-sample replication of trend-following/crisis-alpha | Industry-authored (AQR runs trend strategies commercially) — corroborating, not independent academic verification |

## 15. RS3M / Block 6 / Routine / Paper — Verification

Before and after this block: RS3M hash `1c28b57c` unchanged (verified present and pinned in `src/core/paper-trading/rs3m/safety-guards.ts` — read, never written, this block). Block 6, the Routine, the approval gate, and Paper trading state: unmodified — no file under `scripts/block6/**` or `src/core/paper-trading/rs3m/**` was opened for writing in this block. No orders submitted. R3-B remains `REJECTED` in `src/novacore/research-lab/adapters/block-research-adapter.ts` (`R3B_VERIFICATION`), untouched, un-optimized, and not reused as a template for any Top-5 family.

## 16. NovaCore

Added a new, explicitly READ-ONLY "Strategy #2 Discovery" section to the Research Lab (`src/app/novacore/research/page.tsx`), sourced from a new adapter (`src/novacore/research-lab/adapters/block9-strategy2-discovery-adapter.ts`) that transcribes this report's Top-5 table, the cumulative trial ledger, and the literature-review summary counts. **Nothing was added to Strategy Hub or Bots** — no candidate exists yet (this block explicitly does not run a backtest), consistent with the same discipline Block 8/8.2 applied when their research produced no survivor.

## 17. STOP

Per §29: this report ends at Top-5 selection and pre-registration. **The deep backtest of these five families is deliberately NOT executed in this block** — it is the next, separate, explicitly-gated step, pending review of this selection.
