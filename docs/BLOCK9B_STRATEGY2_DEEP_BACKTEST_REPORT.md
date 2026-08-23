# Block 9.x — Strategy #2 Deep Backtest: Fail-Fast Funnel Results

> **Scope note:** this report executes, unchanged, the 20 configurations frozen in `docs/BLOCK9_STRATEGY2_PREREGISTRATION.md`. No configuration was added, no parameter range was altered, no family was redefined, and no universe was expanded after seeing any result. Two configurations (E-B, E-D) were marked `DATA_INSUFFICIENT` — decided in `src/core/strategy2-research/volatility-risk-premium.ts` BEFORE this funnel was ever run, for the same reason (no free historical options-chain source in this environment) Block 8.2 already used for its own FX Family 2. **This report does NOT begin independent verification of either survivor, and connects nothing to Paper, Alpaca execution, options execution, or LIVE.**

## Decision

**2 of 18 executed configurations reached `CANDIDATE`: E-C (Volatility Risk Premium, VIX-percentile-gated) and C-A (SPY time-series reversal).** Both are reported below with full funnel detail and their portfolio contribution alongside RS3M. Per this block's explicit instruction, **independent verification of either does not begin automatically** — that is a separate, future, explicitly-gated step, exactly like Block 8.3→8.4.

## 1. Cumulative Multiple-Testing Pool

18 of the 20 pre-registered configurations actually ran a backtest (E-B/E-D excluded at Stage 1). Per `docs/BLOCK9_STRATEGY2_DISCOVERY_REPORT.md` §2, the prior cumulative pool was **≥154** (Blocks 4/4.5/5/8/8.2/8.3, reconciled 5+42+24+29+24+30=154). This block adds its own 17 configurations that produced a usable Sharpe ratio (one, D-A's earlier iteration, had a degenerate case handled below) — see `results/block9b/funnel-outcomes.json`'s top-level `numTrialsOwnPool`/`numTrialsCumulativePool` fields:

- **This block's own trial pool: 17** (configurations that reached Stage 9 and produced a computable annualized Sharpe).
- **New cumulative total: 154 + 17 = 171.**
- Per this block's DSR methodology (consistent with Block 8.4's own precedent of reusing a disclosed proxy rather than re-deriving a true cross-era stdev): the Sharpe standard deviation used to benchmark the expected-maximum-Sharpe-under-171-trials is THIS block's own 17-trial pool's measured stdev — a genuinely computed number for this round, not a blind reuse of Block 8.3's older 0.286 proxy, but still a proxy for the TRUE cross-171-trial stdev (which spans FX-pip-based, R-multiple-based, and monthly-return-based methodologies that cannot be honestly pooled together — the same incompatible-units problem Block 8.3 §16 already documented and fixed by keeping DSR pools separate).

## 2. Full Funnel Results — All 18 Executed Configurations

| Config | Family | Final Status | Gross Total | Net Total (REALISTIC) | OOS | Walk-Fwd | DSR (cumulative pool) | Corr. vs RS3M | Rejection / Downgrade Reason |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| D-A | Overnight/Intraday | RESEARCH | +2389.2% | +97.6% | +32.9% | 62.8% (43 windows) | 0.000 | 0.498 | DSR far below 0.5 bar |
| D-B | Overnight/Intraday | RESEARCH | +3498.1% | +353.7% | +44.3% | 64.7% (34 windows) | 0.052 | 0.536 | DSR below bar; corr ≥0.50 |
| D-C | Overnight/Intraday | **REJECTED** | +799.3% | **-97.6%** | — | — | — | — | Net-negative at REALISTIC cost (Stage 4) |
| D-D | Overnight/Intraday | RESEARCH | +2629.1% | +277.4% | +91.9% | 60.6% (33 windows) | 0.065 | 0.528 | DSR below bar; corr ≥0.50 |
| E-A | Volatility Risk Premium | RESEARCH | +485.0% | +484.8% | +125.7% | 66.7% (15 windows) | 0.616 | 0.578 | Corr ≥0.50; MC P95 MaxDD 99.7% unacceptable |
| E-B | Volatility Risk Premium | DATA_INSUFFICIENT | — | — | — | — | — | — | No historical SPY options chain available |
| **E-C** | **Volatility Risk Premium** | **CANDIDATE** | +1281.9% | **+1215.9%** | +49.5% | 60.0% (15 windows) | **0.995** | **0.331** | — |
| E-D | Volatility Risk Premium | DATA_INSUFFICIENT | — | — | — | — | — | — | No historical SPY options chain available |
| M-A | Turn-of-Month | RESEARCH | +287.6% | +243.6% | +35.4% | 72.2% (18 windows) | 0.496 | 0.420 | DSR just below 0.5 bar (narrow miss) |
| M-B | Turn-of-Month | RESEARCH | +228.1% | +197.4% | +37.4% | 71.4% (14 windows) | 0.003 | 0.441 | DSR far below bar |
| M-C | Turn-of-Month | RESEARCH | +82.4% | +66.0% | +27.1% | 30.8% (13 windows) | 0.000 | 0.386 | Walk-forward <50%; DSR far below bar |
| M-D | Turn-of-Month | RESEARCH | +205.6% | +175.8% | +42.2% | 73.3% (15 windows) | 0.495 | 0.386 | DSR just below 0.5 bar (narrow miss) |
| F-A | Defensive/Low-Vol | RESEARCH | +903.4% | +880.8% | +194.4% | 92.3% (13 windows) | 0.828 | 0.870 | Corr far ≥0.50 — not a diversifier |
| F-B | Defensive/Low-Vol | RESEARCH | +934.2% | +921.3% | +191.8% | 92.3% (13 windows) | 0.872 | 0.874 | Corr far ≥0.50 — not a diversifier |
| F-C | Defensive/Low-Vol | RESEARCH | +426.2% | +426.2% | +40.1% | 100% (5 windows) | 1.000 | 0.714 | Corr ≥0.50 — not a diversifier |
| F-D | Defensive/Low-Vol | RESEARCH | +331.7% | +331.7% | +27.0% | 80.0% (5 windows) | 0.997 | 0.600 | Corr ≥0.50 — not a diversifier |
| **C-A** | **Short-Term Reversal** | **CANDIDATE** | +358.6% | **+253.3%** | +35.4% | 70.7% (41 windows) | **0.695** | **0.077** | — |
| C-B | Short-Term Reversal | RESEARCH | +160.0% | +111.5% | +75.8% | 60.6% (33 windows) | 0.001 | 0.088 | DSR far below bar (despite excellent diversification) |
| C-C | Short-Term Reversal | RESEARCH | +963.7% | +163.5% | +82.9% | 66.7% (33 windows) | 0.000 | 0.785 | DSR far below bar; corr ≥0.50 |
| C-D | Short-Term Reversal | RESEARCH | +1643.2% | +1209.1% | +254.5% | 81.8% (33 windows) | 0.507 | 0.806 | Corr far ≥0.50 — not a diversifier |

*(Full per-stage detail, all 12 stages, every config: `results/block9b/funnel-outcomes.json`.)*

## 3. Family-by-Family Findings

### D — Overnight / Intraday Return Decomposition
All 4 configs cleared gross edge, sample adequacy, and OOS. **D-C (the full tug-of-war, long overnight + short intraday, both legs) is REJECTED at Stage 4**: gross return was strongly positive (+799%) but net return is **-97.6%** — daily round-trip costs on BOTH legs (SWING + INTRADAY presets), compounded over 8,447 trading days, are ruinous even at a modest 3-4bps/leg. This is precisely the failure mode the discovery report flagged as D's "main falsification risk," now confirmed. D-A/B/D (overnight-only, single leg) survive to net-positive — the overnight effect itself is real and cost-survivable in this dataset — but none clears the DSR bar under the 171-trial cumulative pool (0.000-0.065), and D-B/D-D additionally correlate ≥0.50 with RS3M. **Family verdict: no candidate. The raw overnight/intraday split exists and survives costs in its simplest (single-leg) form, but is not statistically distinguishable from luck once this project's full research history is honestly accounted for.**

### E — Volatility Risk Premium
**E-C is a CANDIDATE** — the round's strongest result by DSR (0.995) and best-behaved risk profile within the family (MC P95 MaxDD 46.4% vs E-A's 99.7%). The VIX-percentile entry filter (only harvest the premium when trailing-year VIX percentile is at or below its median — i.e., skip the trade when the premium being harvested is already priced cheap) is the decisive difference from E-A (unconditional entry), which is downgraded to RESEARCH specifically because its Monte Carlo tail (99.7% P95 max drawdown) is judged unacceptable despite a respectable own-pool DSR (0.616) — a textbook illustration of why this block's own §16 tail-risk-first rule exists: E-A's headline numbers alone would look attractive, but its simulated worst-case outcome is a near-total loss. Both configs are LONG SVXY (the short-VIX-futures ETP itself), never short — going short would be the opposite, long-volatility trade, and would not have matched the Volmageddon tail-risk case study this family was built around. **Family verdict: 1 genuine candidate (E-C), with the entry filter proven decisive for taming tail risk — exactly the finding that justifies this family's tail-risk gate in the first place.**

### M — Turn-of-Month / Calendar Seasonality
All 4 configs are net-positive, OOS-positive, and — notably — **the pre-registered decay check found NO decay**: every config's most-recent-decade-only return is positive (SPY +35.4%, QQQ +37.8%, IWM +22.8%, DIA +40.0%), so none was rejected on the family-specific §11 decay criterion this report was specifically designed to test for. This is a real, disclosed finding against this family's own headline falsification risk — the effect has NOT visibly decayed in this project's data. What keeps M out of CANDIDATE is the general DSR bar: M-A (SPY, 0.496) and M-D (DIA, 0.495) miss the 0.5 cumulative-pool threshold by a hair, M-B misses more clearly (0.003), and M-C additionally fails walk-forward (30.8% positive, below the 50% majority bar). **Family verdict: no candidate, but the two closest near-misses (M-A, M-D) of the entire round — worth flagging for a future round should the cumulative trial pool's composition change.**

### F — Defensive / Low-Volatility Equity
Every config in this family is a strong STANDALONE statistical result — F-C (USMV) reaches a cumulative-pool DSR of 1.000, the single highest of the round, and all 4 configs clear walk-forward comfortably (80-100%). **Every single one fails on RS3M correlation (0.60-0.87)** — this is the SAME finding Block 8.3's own Family 1 (Volatility-Managed Exposure) already produced (there: 0.79-0.82 correlation, downgraded for the identical reason). A defensive/low-vol tilt on a long-only US-equity-index universe is, empirically, still substantially the same trade as RS3M in this dataset — both are long-biased exposure to the same 4 underlying indices. **Family verdict: no candidate — the statistically strongest family of the round is also the least useful one for THIS project's specific diversification goal, a result this project has now independently reproduced twice.**

### C — Short-Term Reversal
**C-A is a CANDIDATE** and the round's best diversifier by a wide margin: correlation vs RS3M of **0.077**, the lowest of all 20 configs. Its DSR (0.695) clears the 0.5 bar with room to spare, walk-forward is comfortably positive (70.7% across 41 windows — the largest window count of the round, reflecting its higher trading frequency), and its parameter-robustness sweep (the only C-family config where this was evaluated, alongside C-B) classifies as PLATEAU, not CLIFF (Sharpe 0.613 base vs 0.568/0.574 at ±10% threshold perturbation — a real but graceful, non-fragile sensitivity). C-B (QQQ, same design) shows similarly excellent diversification (corr 0.088) but fails DSR decisively (0.001) — a genuine asset-specific difference, not evaluated further per this block's no-reoptimization rule. C-C/C-D (cross-sectional variants) both show strong gross/net returns but correlate far too highly with RS3M (0.79-0.81) to diversify it, and C-C additionally fails DSR. **Family verdict: 1 genuine candidate (C-A) — confirms this family's pre-registered thesis that a genuinely different holding period/mechanism from RS3M's monthly momentum rotation produces genuinely low correlation, when it survives costs and multiple-testing at all.**

## 4. Ranked Family Summary (as requested)

| Rank | Family | Outcome | Why |
|---|---|---|---|
| **1** | **E — Volatility Risk Premium** | 1 CANDIDATE (E-C) | Highest DSR of any survivor (0.995), and the round's clearest illustration that a tail-risk-first design decision (the VIX filter) is what separates a fundable candidate from an unacceptable tail (E-A). |
| **2** | **C — Short-Term Reversal** | 1 CANDIDATE (C-A) | Best diversification of the entire round (corr 0.077), genuinely different time horizon/mechanism from RS3M, survives its own pre-registered cost-erosion falsification test. |
| **3** | **M — Turn-of-Month** | 0 candidates, 2 narrow misses | No decay found (a real, disclosed positive finding against its own headline risk), but the general DSR bar — not the family-specific decay check — is what keeps it out; M-A/M-D missed by <0.01 DSR. |
| **4** | **D — Overnight/Intraday** | 0 candidates, 1 rejected | The core overnight effect survives costs in its simplest form (single-leg) but isn't statistically distinguishable from luck under the full trial pool; the combined tug-of-war design is REJECTED outright on cost erosion. |
| **5** | **F — Defensive/Low-Vol** | 0 candidates | Statistically the STRONGEST family of the round (DSR up to 1.000) but fails on the one criterion that matters most for this specific project: it does not diversify RS3M (corr 0.60-0.87) — the same finding this project already reached once before (Block 8.3 Family 1). |

## 5. Candidate Detail

### E-C — Volatility Risk Premium (VIX-percentile-gated, long SVXY, hard -15% stop)
- Net total return (REALISTIC): **+1215.9%** over 179 months (OPTIMISTIC +1281.9%, STRESSED +1073.7% — costs matter little for this family's own turnover profile).
- Annualized Sharpe: 0.755. CAGR: 18.86%/yr. Max drawdown: 21.0%.
- OOS: +49.5%. Walk-forward: 60.0% positive (15 windows). Regime robustness: positive in 2/4 buckets.
- Monte Carlo (block-bootstrap): P95 max drawdown 46.4%, terminal-loss probability 0.16%.
- Parameter robustness: base Sharpe 0.755, -10% stop 0.746, +10% stop 0.755 — **PLATEAU**.
- DSR: 1.000 (own 17-trial pool), **0.995 (full 171-trial cumulative pool)**.
- Correlation vs RS3M: **0.331** (MEDIUM, below the 0.50 CANDIDATE bar).

**Portfolio contribution (RS3M + E-C, 50/50, overlapping months only):**

| | RS3M alone | 50/50 Blend |
|---|---:|---:|
| Sharpe | 1.097 | 1.064 |
| Max Drawdown | 23.67% | **18.15%** |

Correlation: 0.331. **Reads as risk reduction, not return accretion** — the blend's Sharpe is marginally LOWER than RS3M alone (E-C's own standalone Sharpe, 0.755, is below RS3M's 1.097, so a 50/50 blend mechanically pulls the blended Sharpe down even while cutting drawdown by 5.5 points) — the same "crash protection, not return generation" pattern Block 8.4 §12 already found for R3-B. This is reported plainly, not spun.

### C-A — Short-Term Reversal (SPY, bottom-decile trailing-252d trigger)
- Net total return (REALISTIC): **+253.3%** over 392 months (OPTIMISTIC +358.6%, STRESSED +92.1% — the family's own pre-registered cost-sensitivity concern is real and visible here, though it survives).
- Annualized Sharpe: 0.613. CAGR: 3.94%/yr. Max drawdown: 17.3%.
- OOS: +35.4%. Walk-forward: 70.7% positive (41 windows — the most windows of any config this round). Regime robustness: positive in all 4/4 buckets (the only config in the entire round to clear every regime bucket).
- Monte Carlo (block-bootstrap): P95 max drawdown 26.8%, terminal-loss probability 0.05%.
- Parameter robustness: base Sharpe 0.613, -10% decile 0.568, +10% decile 0.574 — **PLATEAU**.
- DSR: 1.000 (own 17-trial pool), **0.695 (full 171-trial cumulative pool)**.
- Correlation vs RS3M: **0.077** (LOW — comfortably clears the <0.30 "ideal" bar from §21 of the pre-registration, not just the <0.50 minimum).

**Portfolio contribution (RS3M + C-A, 50/50, overlapping months only):**

| | RS3M alone | 50/50 Blend |
|---|---:|---:|
| Sharpe | 0.736 | **0.878** |
| Max Drawdown | 65.11% | **44.19%** |

Correlation: 0.077. **Both Sharpe and max drawdown improve** — a genuine, bug-free diversification benefit on both axes, the strongest portfolio case of the round.

## 6. What This Report Does Not Do

Per the brief's explicit instruction: this report does not begin independent verification of E-C or C-A (that mirrors Block 8.3→8.4's own two-stage discipline and is a separate future step, pending review). Neither survivor is connected to Paper, Alpaca execution, options execution, or LIVE trading in any way. RS3M's hash, Block 6, the Routine, and Paper trading state are all verified unchanged (§9 below). No Strategy Hub or Bots entry was added for either survivor.

## 7. RS3M / Block 6 / Routine / Paper — Verification

RS3M hash `1c28b57c` — confirmed unchanged, still pinned in `src/core/paper-trading/rs3m/safety-guards.ts`, read-only throughout this block (only `buildRs3mBenchmarkSeries`, itself already reused read-only since Block 8.3, was called — no file under `scripts/block6/**` or `src/core/paper-trading/rs3m/**` was opened for writing). Block 6, the Routine, the approval gate, and Paper trading state: unmodified. No orders submitted. R3-B remains `REJECTED`, untouched.

## 8. Reproducibility

```
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/strategy2/fetch-block9b-data.ts
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/strategy2/run-block9b-funnel.ts
```

Raw datasets: `results/block9b/datasets/` (gitignored — machine-fetched from Yahoo Finance and FRED, regenerate via the fetch script above). Raw funnel output: `results/block9b/funnel-outcomes.json` (gitignored — machine-generated, regenerate via the funnel script above). This report and the pre-registration it executes are what get committed, per this project's established convention (Block 5 onward) of committing the narrative report built FROM raw research output, never the raw output itself.
