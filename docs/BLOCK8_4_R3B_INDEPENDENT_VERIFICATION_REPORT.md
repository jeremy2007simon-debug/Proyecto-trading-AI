# Block 8.4 — R3-B Independent Candidate Verification

> **Role note:** this report is written as an INDEPENDENT AUDIT of R3-B, Block 8.3's sole surviving candidate — the mandate was explicitly to try to FALSIFY it, not optimize it. R3-B's implementation (`src/core/us-index-research/trend-pullback.ts`, `regime.ts`) was never modified, never re-parameterized, and never re-fit to new data anywhere in this block.

## Decision

**R3-B REJECTED — DO NOT PROMOTE.**

Not because anything was found broken — the independent reproduction, no-look-ahead audit, cost audit, OOS audit, and portfolio-bug investigation all came back clean. R3-B is rejected because it fails this project's own statistical-significance bar (Deflated Sharpe Ratio ≥ 0.5) once multiple-testing correction is applied honestly across this project's FULL cumulative research history, as this block's brief explicitly required testing. DSR falls from 0.96 (Block 8.3's own narrower 24-trial pool) to **0.23** under the ≥154-trial cumulative pool. This is the central finding of this audit; everything else below is context for how confident that finding is, and how well-behaved R3-B is on every OTHER axis.

## 1. Candidate Specification

Extracted and frozen BEFORE any reproduction or adversarial work began: `docs/R3B_CANDIDATE_SPEC.md`, hash **`9c1f213e`** (pinned by `tests/core/r3b-verification/spec.test.ts`).

Two genuine, previously-undocumented-at-this-precision findings surfaced while writing the spec (neither is a bug; both are now part of the permanent record):
- **Regime-warmup coupling:** `regime.ts`'s `LONG_TERM_TREND` mode only reads the SMA(200) field, but a `byDate` reading is only written once BOTH SMA200 (200-day warmup) AND a realized-vol rolling percentile (273-day warmup) are ready — so the regime filter is a soft no-op for the first ~273 trading days of any dataset, even though it doesn't semantically need the vol data. Quantified in §2: zero practical impact (no trade would have fired in that window anyway).
- **Cost double-charging vs. its own label:** `SWING_ROUND_TRIP_BPS.REALISTIC = 3` is charged in FULL on both the entry day and the exit day independently — a complete round trip costs 6bps, not the 3bps the constant's name implies. This makes Block 8.3's reported net returns MORE conservative than labeled, not less — see §7.

## 2. Independent Reproduction

Written from the frozen spec (`src/core/r3b-verification/independent-reproduction.ts`) — fresh SMA and Wilder-RSI implementations, fresh entry/exit state machine, ZERO imports from `trend-pullback.ts` or `regime.ts`. Only generic, candidate-agnostic infrastructure (portfolio metrics, OOS/walk-forward splitting) is shared, per this block's own explicit allowance.

**Result: 0 unexplained discrepancies.** Full comparison in `results/block8-4/independent-reproduction/comparison.json`:
- Day-by-day position flags: identical for all 8,447 trading days (including the ~273-day regime-warmup window, where the documented divergence turned out to produce zero actual behavioral difference — no trade ever fired there in either version).
- Trades: **66/66 match exactly** (entry/exit dates, prices, hold days).
- CAGR, MaxDD, Sharpe, Sortino, Calmar, OOS CAGR: identical to full floating-point precision.

This is the strongest possible evidence against a shared implementation bug between "the engine" and "the thing auditing it."

## 3. Data Audit

Re-verified independently (`results/block8-4/data-audit/data-audit.json`):
- **0 duplicate dates**, **0 stale-value runs** (≥5 identical consecutive closes never occurs).
- **11 "missing" trading days** flagged against the NYSE calendar utility — all 11 are real, well-documented ad-hoc NYSE closures the calendar module doesn't encode (9/11 four-day closure, Hurricane Sandy, and five presidential/national-mourning closures from 1994 to 2025) — a calendar-tool limitation, not a data defect.
- **Dividend/split re-confirmation:** exactly 135 adjustment step-events found, matching Block 8.3's own fetch report exactly (a first pass at a 1e-9 floating-point threshold spuriously flagged 8,300/8,448 bars from stored-value noise — caught and fixed to 1e-6 before being reported).
- **Independent second-source cross-check:** SPY daily returns vs. FRED's `SP500` index series (2024-2026, the only free, keyless second source reachable — Stooq is blocked by a JS proof-of-work challenge, Nasdaq's API returned empty data) — **0.997 correlation**, mean absolute daily difference 0.039%. PASS.

## 4. No-Look-Ahead Audit

9 adversarial tests (`tests/core/r3b-verification/no-lookahead-adversarial.test.ts`), against BOTH the original and the independent reproduction: mutating far-future bars, dropping the last bar, injecting a synthetic 2:1 split, shifting every timestamp by 5 years, and OOS/walk-forward boundary integrity. **0 look-ahead found** — every test passes.

## 5. Regime Sensitivity — the flagged "cliff"

Pre-registered symmetric perturbations (`-10%/-5%/BASE/+5%/+10%`), one parameter at a time, classification rule frozen before running (`results/block8-4/regime-sensitivity/continuous-parameters.json`):

| Parameter | Base | Classification |
|---|---:|---|
| `rsiPeriod` | 14 | **PLATEAU** |
| `maxHoldDays` | 20 | **PLATEAU** |
| Regime SMA period | 200 | **PLATEAU** (via the validated independent reproduction — even a much wider 100-250 range stays a plateau) |
| `smaTrendPeriod` | 50 | WEAK_PLATEAU (a real but modest downside-only drop at -10%) |
| `entryRsiThreshold` | 40 | **CLIFF** — Sharpe 0.71→0.33 at -10% (36), 0.71→0.52 at -5% (38); upside is fine |

Discrete regime-TYPE comparison (reusing Block 8.3's own already-computed R3-A/C/D — no new numbers fabricated for something already measured): `NONE` (Sharpe 0.60) → `LONG_TERM_TREND` (0.71, R3-B) → `VOL_REGIME` (0.27, collapse) → `BOTH` (0.28, collapse). **CLIFF** at the categorical level.

**Verdict:** the flag from Block 8.3 is real and now precisely located — the fragility is in `entryRsiThreshold`'s specific value and in choosing a TREND-type regime filter over a VOLATILITY-type one, NOT in the regime SMA window's exact length (which is genuinely robust). Neither UNSTABLE by this block's own frozen classification rule, but two real CLIFFs is a meaningful yellow flag, weighed in the final decision.

## 6. Execution Timing

R3-B was promoted (Block 8.3) under a same-close, one-day-lagged-decision convention — never before audited against the more conservative next-open convention RS3M itself uses. Tested both, neither chosen retrospectively (`results/block8-4/execution-timing/timing-sensitivity.json`):

| | Same-close (original) | Next-open (RS3M-like) |
|---|---:|---:|
| CAGR | 2.41% | 2.38% |
| Sharpe | 0.706 | 0.661 |

Survives the more conservative convention essentially intact (Δ CAGR = 0.02pp, Δ Sharpe = 0.05). **Not a source of fragility.**

## 7. Costs

Swept 0/1/2/3/5/8/12/15/**20bps per leg** (`results/block8-4/costs/cost-sensitivity.json`). Survives the ENTIRE range — net CAGR still +1.71%/yr at 20bps/leg (i.e. a 40bps effective round trip), break-even never reached within the tested range. Both the per-leg (as-implemented) and the true-total-round-trip interpretation of the "Xbps round trip" label (§1) are reported; the strategy clears both. All figures labeled **ESTIMATED** — no real bid/ask feed reachable this environment.

## 8. Sample Size

33.5 years, **67 trades** (2.0/yr), **5.24% time-in-market** (a highly selective, mostly-cash strategy), median hold 6 days (min 1, max 20 — the max-hold cap). A thin trade count for high-confidence per-trade inference, offset by the long calendar span and the OOS/walk-forward/rolling-OOS results below all pointing the same direction.

## 9. Out-of-Sample

Full re-derivation, independent of Block 8.3's summary figure (`results/block8-4/oos/sample-size-and-oos.json`):

| | In-sample (283mo) | Out-of-sample (120mo) |
|---|---:|---:|
| CAGR | 1.99% | **3.40%** |
| Sharpe | 0.566 | **1.097** |
| MaxDD | 10.68% | **2.94%** |

OOS is BETTER than in-sample on every metric — the opposite of the decay pattern that would flag overfitting.

## 10. Rolling OOS

Expanding-train, fixed 24-month test window, no reoptimization, 27 windows (`results/block8-4/oos/rolling-oos.json`): **77.8% positive** (21/27), worst window -3.64%/yr (2009-02 to 2011-01, the post-GFC whipsaw). Every window from 2013 onward is solidly positive except one (+0.75%).

## 11. Walk-Forward — all 18 windows

Independently reproduced (`results/block8-4/walk-forward/windows-detailed.json`): **10/18 positive (55.6%)**, matching Block 8.3's summary exactly. Distribution: best +14.1%, worst -8.2%, median +1.1% — "a modest median with a wide spread," exactly the brief's own caution that 10/18 "no es evidencia tremendamente fuerte." Critically, the per-window excess-vs-SPY figures reveal WHERE the edge lives (see §12).

## 12. Benchmarks — return or risk reduction?

Walk-forward excess-vs-SPY is strongly NEGATIVE in strong-bull windows (R3-B, being ~95% in cash, misses most rallies: e.g. 2009-02→2010-01, excess -34.0%) and strongly POSITIVE in crash windows (2000-02→2001-01 excess +15.2%; 2001-02→2002-01 excess +17.3%; 2008-02→2009-01 excess **+39.4%**, R3-B flat at 0% while SPY collapsed). **Unambiguous answer: R3-B's value is crash protection, not return generation** — fully consistent with its low correlation to RS3M (itself usually long).

## 13. RS3M MaxDD Discrepancy — RECONCILED

**Root cause: period-length, not a bug.** Recomputing RS3M's own monthly series (via its unmodified, read-only-reused engine) on Yahoo data restricted to Block 6's official `datasetFrom` window (2016-01-01 onward, 124 months) gives MaxDD **23.67%** — within 0.32 percentage points of Block 6's own Alpaca-sourced 23.99% (`results/block8-4/maxdd-reconciliation/reconciliation.json`). The SAME Yahoo data over the FULL available history (1993-2026, 400 months) gives MaxDD 65.11%, EXACTLY matching Block 8.3's reported figure. The 65.1% figure is real and correctly computed — for a materially longer, unofficial extended window that captures the 2000-02 and 2008 crises RS3M's official window does not. The residual 0.32pp gap is attributable to Yahoo-vs-Alpaca data-source differences (Block 6's own §6 already documents raw-vs-adjusted sensitivity of similar magnitude), not a computational error. No fix to generic infrastructure was needed.

## 14. Portfolio Rebuild

Rebuilt from scratch on BOTH windows (`results/block8-4/portfolio/portfolio-rebuild.json`); the OFFICIAL window is primary/authoritative:

**PRIMARY (RS3M's official window, 2016-01 to 2026-08, 128 months):**

| | RS3M alone | R3-B alone | 50/50 | Equal-risk (85% R3-B/15% RS3M) |
|---|---:|---:|---:|---:|
| CAGR | 17.71% | 3.47% | 10.79% | 5.74% |
| Vol | 17.41% | 3.12% | 8.88% | — |
| MaxDD | 23.67% | 2.94% | **12.28%** | 3.83% |
| Sharpe | 1.028 | 1.11 | **1.203** | **1.496** |

Correlation: **0.021**. Drawdown correlation: 0.32. MaxDD improvement vs. RS3M alone: **11.4 points**. Sharpe improvement: **+0.175**. The extended (1993-2026) window shows the same qualitative pattern (Sharpe 0.740→0.842, MaxDD 65.1%→37.2%, correlation 0.111 — see §18 of the Block 8.3 report). **Genuine, bug-free diversification benefit on both windows.**

## 15. Portfolio Contribution

On the primary window, R3-B's half-weight contributes **positive** return (18.5% of the combined 50/50 portfolio's total return contribution) — not merely risk reduction with a return drag, contrary to what a naive "low-CAGR component" read might suggest.

## 16. Monte Carlo (10,000 sims, R3-B alone, full history)

Reshuffle and block-bootstrap agree closely (`results/block8-4/monte-carlo/r3b-monte-carlo.json`): median terminal equity ~2.22x, MaxDD P95 ~14.2-14.3%, **0% probability of terminal loss** over the full simulated horizon. Two figures need careful reading, not spin: **probability of underperforming SPY buy-and-hold = 100%**, and **probability of any negative rolling 3-year period = 95.7%**. Neither is alarming once correctly interpreted — R3-B was never designed to beat SPY standalone (§12), and a low-absolute-return, ~5%-time-in-market strategy will mechanically show many near-zero-or-negative 3-year stretches under single-month reshuffling. Both figures are reported here precisely because a falsification-oriented audit should surface them prominently, not bury them.

## 17. Tail Risk

Worst day -3.78%, worst week -7.29%, worst month -7.33%, P99 daily loss -0.66%, longest losing streak 5 days, max drawdown duration 2,338 days (expected for a strategy invested only ~5% of the time — long flat stretches aren't losses). No figure is alarming for an equity strategy.

## 18. Regime Contribution

Causal BULL/BEAR (vs. SMA200) and LOW_VOL/HIGH_VOL (realized-vol percentile) breakdown (`results/block8-4/regime-sensitivity/regime-contribution.json`): +3.73%/yr in BULL (303mo), **-1.90%/yr in BEAR** (88mo) — an honest, non-hidden negative bucket (mechanically expected: the regime filter requires SPY>SMA200 to enter, so exposure during BEAR-classified stretches comes only from trades opened while bullish that later flip); +2.28%/yr LOW_VOL, +2.60%/yr HIGH_VOL (no lopsided vol-regime dependence). Rate-hiking/cutting and risk-on/risk-off regimes were NOT computed (no external rate/sentiment data source fetched — same disclosed limitation as Block 8.3).

## 19. Performance Concentration

Removing the best 1/3/5 trades: CAGR 2.41%→2.27%→2.02%→1.79% (graceful degradation). Removing the best 1/3/5 months: 2.41%→2.27%→2.02%→1.81% (same pattern). **Never collapses to zero or negative** — the edge is not dependent on a handful of outlier events (`results/block8-4/concentration/concentration-analysis.json`).

## 20. Subperiods

All 4 decade-buckets positive: 1993-99 (+3.74%/yr, Sharpe 1.12), 2000-09 (+1.89%, Sharpe 0.64), 2010-19 (+1.25%, Sharpe 0.31 — the weakest decade, and where the full-series MaxDD of 10.68% occurs), 2020-26 (+3.55%, Sharpe 1.25). Both halves positive (2.67% / 2.15% — a mild, non-fatal decay, consistent with the OOS-better-than-IS finding in §9 not being contradicted, since OOS covers only the most recent ~10 years within the "second half").

## 21. PSR / DSR — the decisive finding

Full detail: `results/block8-4/statistical-validation/dsr-full-pool.json`. Skewness 0.19, kurtosis 14.9 (fat-tailed monthly returns), 403 observations. PSR vs. 0 = 1.0 (unambiguously distinguishable from a zero Sharpe on its own).

| Trial pool | Trials | Benchmark Sharpe | **DSR** |
|---|---:|---:|---:|
| Block 8.3's own daily-family pool | 24 | 0.567 | **0.959** |
| **Full cumulative project history** (Block 4 + 4.5 + 5 + 8 + 8.2 + 8.3) | **≥154** | **0.767** | **0.227** |

The 154-trial figure uses Block 8.3's own measured Sharpe-stdev (0.286) as a disclosed PROXY across the full pool — the true empirical stdev across all 154 historical trials (spanning incompatible R-multiple and monthly-return units) was not re-derived, which is itself a limitation (§22), but going the OTHER direction (re-deriving a genuinely comparable stdev across 154 methodologically diverse trials) would very plausibly INCREASE that stdev, not decrease it — meaning 0.227 is, if anything, an optimistic read of the true conservative DSR, not a pessimistic one. **Under this project's own established 0.5 candidate bar (used to downgrade Families 1/4/5 in Block 8.3), R3-B fails.**

## 22. Limitations

- The 154-trial DSR reuses a 24-trial-derived Sharpe-stdev as a proxy for the full pool — a genuine methodological simplification, disclosed rather than presented as a rigorous re-derivation.
- FRED's cross-source data check covers only the trailing ~2 years (FRED's `SP500` series starts ~2016); the pre-2016 portion of SPY's history has no independent second-source confirmation in this round.
- Rate-hiking/cutting and risk-on/risk-off regime contribution were not computed (no external data source fetched).
- Regime-sensitivity perturbations were tested one parameter at a time (never combinatorially) — a joint-parameter cliff (two parameters interacting) cannot be ruled out by this design, though none of the individually-tested parameters besides `entryRsiThreshold` and regime-type showed fragility.
- Sample size (67 trades) is thin for trade-level inference on its own; the OOS/walk-forward/rolling-OOS/subperiod results were weighed together specifically to compensate for that, not any single one alone.

## 23. Decision

**R3-B REJECTED — DO NOT PROMOTE.**

Every falsification angle EXCEPT one came back clean: independent reproduction (0 discrepancies), no-look-ahead (0 found), execution-timing sensitivity (survives), cost sensitivity (survives to 20bps/leg), OOS (better than IS), rolling OOS (77.8% positive), portfolio diversification benefit (genuine, bug-free, confirmed on the authoritative window), concentration (graceful degradation), subperiods (all positive). The one angle that fails — Deflated Sharpe Ratio collapsing from 0.96 to 0.23 once this project's full, honestly-accounted-for research history is used as the trial pool, per this block's own explicit and central instruction — is enough on its own, combined with two real parameter/regime-type CLIFFs, to conclude R3-B's apparent edge is not reliably distinguishable from a false discovery. This is precisely the outcome a rigorous falsification mandate exists to surface, and it is reported here in full rather than rescued by a more convenient trial count.

No `R3B_CANDIDATE_V1` was frozen. No Paper execution, no Alpaca connection, no approval-gate change was made anywhere in this block, and the next block (Paper design) does not begin from this report.

---

*Reproducibility:*
```
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block8-4/reconcile-rs3m-maxdd.ts
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block8-4/run-independent-reproduction-comparison.ts
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block8-4/regime-sensitivity-audit.ts
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block8-4/data-audit.ts
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block8-4/execution-cost-oos-wf-audit.ts
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block8-4/portfolio-montecarlo-tailrisk-audit.ts
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/block8-4/regime-concentration-subperiods-audit.ts
```
Raw results: `results/block8-4/` (gitignored, regenerate via the commands above).
