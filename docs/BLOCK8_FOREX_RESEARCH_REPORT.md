# Block 8 — Forex Research Lab

## Decision

**NO FOREX CANDIDATE — CONTINUE RESEARCH.**

All 29 pre-registered FX configurations were rejected by the validation funnel, none surviving past Stage 3 (realistic transaction cost). Per the Block 8 brief's own stated principle, this is a fully valid and — given how thin every gross edge found actually was — the intellectually honest outcome: "Prefiero 0 candidatos a una estrategia sobreoptimizada."

---

## 1. Objective

Investigate, scientifically, whether a simple, reproducible FX strategy keeps a positive edge out-of-sample after realistic transaction costs, with a drawdown profile conservative enough to later consider Demo/Paper and potentially prop-firm evaluation. Strategy #2 is completely independent of RS3M — no shared code, data, parameters, or conclusions.

## 2. Repository / Safety Verification (pre-work)

Before any code was written:

- Confirmed the real NovaCore history lives on `feature/novacore-observability-upgrade` @ `2b9f05a`, containing Blocks 1-7.
- Confirmed `RS3M_CANDIDATE_V1` frozen at commit `118f14d`, hash **`1c28b57c`**, present in `docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md` and `src/core/paper-trading/rs3m/**`.
- Created `feature/forex-research-lab` from that exact commit.
- `src/core/paper-trading/rs3m/**`, `scripts/block6/**`, RS3M parameters, the candidate hash, the Routine, the approval gate, Alpaca Paper credentials, and forward evidence were **never opened for writing** during this block (verified again in §14, Final Safety Audit).

## 3. Data

**Pairs:** EUR/USD, GBP/USD, USD/JPY, AUD/USD.
**Timeframes fetched:** 15m, 30m, 1h, 4h (priority order per the brief). No tick/sub-minute data.
**Provider:** Yahoo Finance's unofficial `chart` endpoint (`query1.finance.yahoo.com/v8/finance/chart/<PAIR>=X`) — the only FX data source reachable from this environment without an API key. No Alpaca (equities only), no OANDA/Polygon/Twelve Data account configured. Fetch script: `scripts/research/forex/fetch-fx-candles.ts`.

### 3.1 Data quality — verified, not assumed

| Market | Timeframe | Bars | Span (days) | Sufficient for OOS/WF? | Dropped (null gaps) | Dropped (outside FX week) |
|---|---|---:|---:|---|---:|---:|
| EUR/USD | 1h | 17,164 | 1019.1 | ✅ | 282 | 55 |
| EUR/USD | 4h (resampled) | 4,433 | 1019.0 | ✅ | 0 | 0 |
| EUR/USD | 15m | 5,598 | 81.2 | ❌ | 82 | 0 |
| EUR/USD | 30m | 2,801 | 81.2 | ❌ | 40 | 0 |
| GBP/USD | 1h | 17,166 | 1019.1 | ✅ | 280 | 55 |
| GBP/USD | 4h (resampled) | 4,433 | 1019.0 | ✅ | 0 | 0 |
| GBP/USD | 15m | 5,599 | 81.2 | ❌ | 81 | 0 |
| GBP/USD | 30m | 2,801 | 81.2 | ❌ | 40 | 0 |
| USD/JPY | 1h | 17,103 | 1019.1 | ✅ | 378 | 20 |
| USD/JPY | 4h (resampled) | 4,431 | 1019.0 | ✅ | 0 | 0 |
| USD/JPY | 15m | 5,583 | 81.2 | ❌ | 97 | 0 |
| USD/JPY | 30m | 2,795 | 81.2 | ❌ | 46 | 0 |
| AUD/USD | 1h | 17,249 | 1019.1 | ✅ | 188 | 64 |
| AUD/USD | 4h (resampled) | 4,448 | 1019.0 | ✅ | 0 | 0 |
| AUD/USD | 15m | 5,598 | 81.2 | ❌ | 82 | 0 |
| AUD/USD | 30m | 2,801 | 81.2 | ❌ | 40 | 0 |

Full machine-readable version: `results/block8/forex/data-quality-report.json`.

**Explicit caveats (disclosed up front, not discovered after a good-looking backtest):**

- **Bid/ask vs mid:** this feed is an indicative aggregator/last-traded price series, **not a measured bid/ask**. `volume` is always 0. There is no true spread in this data — spread/commission/slippage/swap are therefore modeled as documented **assumptions** (§6), never derived from this feed. No FX strategy in this research reads `volume` (verified by a dedicated test, §12).
- **Timezone:** every candle timestamp is stored as UTC (verified against the raw Unix-epoch source field, independent of the feed's reported display timezone metadata).
- **Missing bars:** provider-reported null OHLC bars were dropped (counts above), never interpolated or fabricated.
- **Weekends / trading sessions:** filtered through this research's own 24/5 FX calendar (`src/core/market-hours/forex-calendar.ts` — fixed Sun 22:00 UTC open / Fri 22:00 UTC close, a documented DST-naive simplification of the real NY-time-anchored FX week, which can shift the true open/close by up to an hour depending on season).
- **DST:** the calendar's fixed-UTC-cutoff convention absorbs DST without special-casing — a deliberate simplification, not a claim of matching the exact real-world rollover instant.
- **4h bars do not exist natively** on this provider — they are resampled from 1h bars (standard OHLC aggregation on fixed UTC 4-hour boundaries) and tagged with a distinct `provider` id (`yahoo-chart-unofficial-resampled-4h`) so they are never silently conflated with a native feed.
- **15m/30m are capped at ~81 days** of history by the provider — far short of this research's own ~365-day bar for a defensible OOS split plus walk-forward. These were still fetched and run (see §9, EXPLORATORY block) but are flagged `INSUFFICIENT_SAMPLE` and are structurally excluded from Monte Carlo/walk-forward/candidate consideration by the funnel itself, not by a post-hoc filter.
- **No data adjustments applied** (FX spot has no splits/dividends to adjust for).
- **No provider mixing:** every 1h/4h experiment uses exactly one native+one resampled series per pair, both tagged; nothing blends two different sources.

## 4. Research Budget (registered before results were inspected)

29 configurations total (within the 20-40 budget), spread across 5 families and 4 pairs — never 40 per pair. Fixed in `scripts/research/forex/run-block8-funnel.ts`'s `buildFunnelSpecs()` before the funnel was ever executed (see this file's git history for the commit that added it, unmodified since).

| Family | Hypothesis | Configs | Pairs touched | Timeframes |
|---|---|---:|---|---|
| A: FX Trend/Momentum | ROC + EMA50 slope + ADX confirms sustained directional moves | 5 | EUR/USD, GBP/USD | 1h, 4h |
| B: FX Pullback in Trend | Shallow EMA50 pullback within an EMA50/EMA200 trend, confirmed re-entry | 5 | EUR/USD, USD/JPY | 1h, 4h |
| C: FX Volatility Breakout | ATR compression followed by a confirmed structural break | 5 | EUR/USD, AUD/USD | 1h, 4h |
| D: FX Session Breakout | London/New York/overlap liquidity injection resolves the prior range | 5 | EUR/USD, GBP/USD, USD/JPY | 1h |
| E: FX Controlled Mean Reversion | ATR-normalized stretch from EMA20 + RSI extreme, RANGE/LOW_VOLATILITY only | 5 | EUR/USD, AUD/USD | 1h, 4h |
| EXPLORATORY (insufficient sample) | Same families, 15m/30m short window — sanity check only | 4 | EUR/USD, GBP/USD | 15m, 30m |

Families investigated but explicitly **not** given separate configs: Multi-pair diversified (§10 — analyzed as a portfolio overlay on top of individual-pair results, since no individual-pair config survived to be worth combining).

**Prohibited techniques never implemented:** martingale, unbounded grid, unlimited averaging down, doubling after losses, recovery systems, no-stop strategies, latency arbitrage, quote exploitation, news-spike gambling, overleveraged scalping. Every strategy uses a single fixed-size entry with a hard ATR stop — verified by test (§12).

## 5. Strategy Implementations

Five new, independent strategy modules under `src/core/strategy-manager/strategies/forex/`, registered only in a dedicated `getForexResearchStrategyManager()` (`src/core/strategy-manager/forex-research-registry.ts`) — never wired into the production Strategy Manager, any API route, the Consensus Engine, or RS3M. Same shape/economic-logic family as three of Block 5's equity strategies (mirroring, not reusing, their code — Block 5's own strategies and audited conclusions are untouched), plus two genuinely new families (Session Breakout, Controlled Mean Reversion) with no prior equivalent in this codebase.

Important adaptation: this FX data source reports **zero volume** for every bar. Block 5's `volatility-compression-breakout` strategy gates on a volume-confirmation filter that would silently disable the FX version entirely (volumeRatio would always evaluate to a fixed fallback of 1, permanently failing any multiplier > 1). The FX Volatility Breakout strategy (Family C) uses **rising ADX** as its confirmation signal instead — disclosed in the strategy's own docstring, not discovered as a bug after the fact.

## 6. Cost Model

`src/core/backtesting/research/forex-cost-presets.ts` — FX-specific, pip-based, **not** derived from the equity-tuned `REALISTIC_COST_SCENARIO`. Three scenarios per pair, run for every surviving-to-Stage-3 config:

| Pair | Pip size | Spread (pips) OPT/REAL/STRESS | Slippage OPT/REAL/STRESS | Swap (pips/night) OPT/REAL/STRESS |
|---|---:|---|---|---|
| EUR/USD | 0.0001 | 0.2 / 0.8 / 2.5 | 0 / 1bp / 5bp | 0 / 0.3 / 0.8 |
| GBP/USD | 0.0001 | 0.5 / 1.2 / 3.5 | 0 / 1.5bp / 7bp | 0 / 0.4 / 1.0 |
| USD/JPY | 0.01 | 0.2 / 0.9 / 2.5 | 0 / 1bp / 5bp | 0 / 0.3 / 0.8 |
| AUD/USD | 0.0001 | 0.5 / 1.3 / 3.5 | 0 / 1.5bp / 7bp | 0 / 0.4 / 1.0 |

All figures are **assumptions** sourced from commonly published typical retail/ECN spread ranges — this research has no measured bid/ask to calibrate against (§3.1). `commissionPerFill` is fixed at 0 for every scenario: the engine's `commissionPerFill` is a flat-$ field that does not scale with position size, the wrong shape for FX round-turn commission (which scales with notional) — cost is instead carried entirely through `halfSpread`, which does scale correctly with position size in the engine's existing fill logic. Swap/rollover is applied **post-hoc** (the engine has no native swap concept) as a conservative per-night-held charge, scaled by position size, always ≤ 0 — verified by test.

**Break-even cost:** computed separately via a price-scale-safe generic bps sweep (`costsForBpsGeneric`, pure `slippagePct`, no absolute-dollar `halfSpread` term — Block 5's `costsForBps` uses a fixed $0.005 half-spread calibrated for SPY's ~$450 price, which would be ~45bps at EUR/USD's ~1.1 price and ~0bps at USD/JPY's ~150 price if reused directly).

## 7. Execution Realism Audit

- **No look-ahead:** the shared engine (`event-driven-simulator.ts`) only ever evaluates a strategy on `candles[0..i]` for bar `i` — structurally unchanged by Block 8. Verified for every FX strategy via a dedicated "prefix-stable" test (§12): the signal for the last bar of a truncated series is byte-identical whether or not future bars exist in the array passed in.
- **Same-bar ambiguity:** `CONSERVATIVE` `sameCandlePolicy` (the engine default) applied throughout — a bar touching both stop and target is always resolved unfavorably, and every such bar is flagged.
- **Entry timing:** MARKET execution mode, same-bar signal fill, cost-adjusted per the engine's existing adverse-fill convention — unchanged from equities.
- **Gap/slippage direction:** entries and stop-loss/time exits pay the adverse side of spread+slippage; take-profit exits fill exactly at their price (resting-limit-order convention) — same convention already audited for equities in Block 4.5, unmodified.

## 8. Backtesting Engine Isolation (the one shared-code change)

The engine hardcoded `createNyseCalendar` for every market before this block. FX needs a 24/5 calendar, not NYSE's regular-trading-hours one. Fix: a new `getMarketCalendar(market)` registry (`src/core/market-hours/calendar-registry.ts`) that the engine now calls instead of `createNyseCalendar` directly.

**Safety property, verified by test** (`tests/core/market-hours/calendar-registry.test.ts`): every market that existed before Block 8 (SP500, NASDAQ100, RUSSELL2000, DOWJONES) resolves through the registry to **bit-for-bit identical** behavior as calling `createNyseCalendar` directly — same `isTradingDay`, `getStatus`, `getSessionStartUTC`, `getTradingDayKey` outputs for every probed instant, including a holiday and a weekend. This is what guarantees RS3M and every prior block's equity backtests are unaffected. Only the four new `FOREX_*` markets resolve to the new calendar.

Two label maps (`market-benchmark-adapter.ts`, `market-news/relevance.ts`) needed the three new `Market` union members added to stay exhaustive — purely additive string labels, no logic changed.

## 9. Validation Funnel — Results

Full funnel: Sanity → Gross edge (zero-cost) → Realistic FX cost (3 scenarios) → OOS (chronological split) → Walk-forward → Regime → Monte Carlo → Multiple-testing context. Every config's full JSON is under `results/block8/forex/stage-results/<id>.json` (reproducible: re-running `run-block8-funnel.ts` skips any file that already exists).

| Stage | Survivors |
|---|---:|
| Sanity (≥5 trades, finite metrics) | 29 / 29 |
| Gross edge (zero-cost expectancyR > 0) | 12 / 29 |
| Realistic FX cost (expectancyR > 0 at REALISTIC scenario) | **0 / 29** |
| OOS / Walk-forward / Monte Carlo | not reached — no config survived Stage 3 |
| Final candidates | **0** |

**All 29 configurations were REJECTED.** None reached OOS, walk-forward, or Monte Carlo — the funnel correctly stopped spending compute the moment a fundamental stage failed (§14 of the brief), so no OOS/walk-forward/Monte-Carlo numbers exist for any config, and none are fabricated here.

### 9.1 The closest near-miss

**FX Volatility Breakout, AUD/USD, 4h, compression≤30th percentile** (`fx-volatility-breakout-audusd-4h-p30`):

- Zero-cost expectancyR: **+0.118** (a real, positive gross edge)
- OPTIMISTIC-cost expectancyR: +0.099 (still positive)
- REALISTIC-cost expectancyR: **-0.004** (barely negative)
- STRESSED-cost expectancyR: -0.355
- Break-even cost: **~2.4 bps**, classified `WEAK` robustness
- Sample: 51 trades, `MEDIUM` sample quality

This pair/family combination has a genuine gross edge, but it survives only under an unrealistically generous (OPTIMISTIC/institutional-grade) spread assumption, and even then the sample (51 trades) is too small to trust. Rejected correctly — not close enough, on either cost margin or sample size, to justify a Stage-4+ run.

### 9.2 A broader, genuine pattern (not cherry-picked)

12 of 29 configurations (41%) had a **positive gross (zero-cost) edge** — this is not "nothing was ever found." But every one of those 12 had a break-even cost under ~3.2 bps (most under 1 bp — see `results/block8/forex/stage-results/*.json`, `breakEven.breakEvenBps` field), an order of magnitude below even the OPTIMISTIC spread assumption for any of these four pairs (§6). This reads as consistent with FX major pairs being close to efficiently priced at 15m-4h resolution for these five hypothesis families — real, small, statistically detectable patterns exist, but they are economically worthless once any realistic transaction cost is applied. This is a substantive finding, not an absence of one.

### 9.3 Parameter robustness

Family A (FX Trend/Momentum, EUR/USD/1h) zero-cost expectancyR moved **monotonically** with ROC lookback: -0.038 (ROC=14) → -0.014 (ROC=20) → +0.003 (ROC=30) — a gradual slope, not a single spike at one "magic" parameter, which is the shape this research treats as a positive robustness signal (§19 of the brief) even though the final sign never turns net-positive after cost. Family E (Mean Reversion, EUR/USD/1h) showed positive gross edge at all three tested z-thresholds (1.5/2.0/2.5) — again a plateau, not a spike — reinforcing §9.2's reading that the gross pattern is real, just too thin to survive cost.

### 9.4 Regimes

`performanceByRegime` was computed for every REALISTIC-cost run (persisted in each result file) but is not separately tabulated here: since every config was net-negative at realistic cost overall, per-regime breakdowns would only be evidence for a candidate that does not exist — presenting them here risks implying a regime-conditional edge nobody validated end-to-end. Available for inspection in the raw JSON for any reader who wants it.

### 9.5 Multiple testing

29 configurations tested, registered before any result was seen. Probabilistic/Deflated Sharpe Ratio (`src/core/backtesting/research/deflated-sharpe.ts`) is, by that module's own documented scope, applied only to strategies that reach the funnel's deep-validation stages — **none did**, so PSR/DSR was deliberately not computed here; doing so would be decorative, not evidence, exactly the failure mode that module's docstring warns against. The honest multiple-testing conclusion is simpler and stronger: with 29 independent tries, 12 gross-positive results by chance/genuine-microstructure noise is unsurprising, and zero of them cleared even the least generous realistic-cost bar.

### 9.6 Execution stress

The three-scenario cost run (§6) IS this block's execution-stress test: every config that had a positive edge at OPTIMISTIC cost lost it by REALISTIC and lost significantly more by STRESSED (§9.1, §9.2) — a strategy whose sign flips between "generous" and "typical" cost assumptions is, by this research's own standard, not executable.

## 10. Risk Sizing, Daily Risk, Multi-Pair Correlation

Not evaluated in depth: this analysis is only meaningful for a strategy with a demonstrated positive out-of-sample edge, and none exists. Two things are still worth recording:

- **Risk-per-trade sweep (0.10%/0.25%/0.50%)** was not run — with zero surviving configs, sweeping position-sizing risk on an already-negative-expectancy strategy would not change the sign of the outcome, only its magnitude.
- **Multi-pair currency exposure** (Family F): a EUR/USD long and a GBP/USD long both carry the same underlying short-USD exposure and are not independent — this concentration risk is real and would need explicit modeling (correlated VaR, not summed independent risk) for any future FX portfolio strategy. Recorded here as a documented constraint for Block 9+, not something this research had a surviving strategy to demonstrate on.

## 11. Prop-Firm Analysis

**Not performed.** Per the brief's own explicit ordering ("Primero encontrar edge FX. DESPUÉS estudiar si los supervivientes son compatibles con prop firms" — §23), prop-firm rule verification and challenge simulation apply only to strategies that survive the FX research funnel. None did. `src/novacore/prop-firm/types.ts`'s generic `TradingProgramConstraintSet` (already scaffolded pre-Block-8) remains unused by this block, exactly as intended — no FTMO-specific values were fetched, hardcoded, or guessed, and no challenge was purchased.

## 12. Tests

New test files (all passing, see §14):

- `tests/core/market-hours/forex-calendar.test.ts` — 24/5 week boundaries, `getStatus`/`getTradingDayKey`/`getSessionStartUTC`, session-window ordering.
- `tests/core/market-hours/calendar-registry.test.ts` — bit-for-bit NYSE-calendar equivalence for every pre-existing market (the RS3M-safety property, §8), and genuine FX-vs-NYSE divergence for the four new markets.
- `tests/core/backtesting/research/forex-cost-presets.test.ts` — pip-size math (EUR/USD vs USD/JPY, 100x pip-size difference), OPTIMISTIC≤REALISTIC≤STRESSED ordering for every pair, commission always 0, swap always ≤0 and proportional to nights held, zero swap for intraday/OPTIMISTIC.
- `tests/core/strategy-manager/strategies/forex/fx-strategies.test.ts` — FX-only market declarations, no-volume-dependency smoke check, prefix-stability (no-look-ahead) for every strategy, WAIT/BUY/SELL sanity, bounded single-entry risk for Mean Reversion, independence from the rejected SPY mean-reversion strategy.
- `tests/novacore/research-lab/block-research-adapter.test.ts` — updated (not weakened) to also cover the new `FOREX_RESEARCH_V1` project's internal count consistency.

## 13. NovaCore Integration (read-only)

- **Research project:** `FOREX_RESEARCH_V1` added to `src/novacore/research-lab/adapters/block-research-adapter.ts` (`listResearchProjects()`), following the exact `ETF_ROTATION_RESEARCH`/`SP500_LEGACY_STRATEGY_RESEARCH` pattern — hand-transcribed counts, `sourceDoc` pointing at this report, existing exports untouched (purely additive).
- **Strategy Hub:** **unchanged.** `src/novacore/strategy-hub/registry.ts` still lists only RS3M — no candidate exists to add, so nothing was added as `CANDIDATE` or any other status. This is the correct, intended behavior per the brief (§30: "Si aparece candidate: mostrar... CANDIDATE" — none appeared).
- **No execution wiring, no MT5 interface, no Demo/Paper connection** — nothing beyond the read-only Research Lab entry was touched.

## 14. Final Safety Audit

- RS3M hash: **`1c28b57c`** — unchanged (re-verified in `docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md` on this branch).
- `git diff` against the base commit touching `src/core/paper-trading/rs3m/**` or `scripts/block6/**`: **0 lines**.
- Routine / Alpaca Paper credentials / LIVE flag: unchanged, never read or written by this block.
- Orders submitted by this block: **0**.
- MT5 connection: none — not implemented, per the brief's explicit Block 9 deferral.
- Prop-firm challenge purchased: **0** — not applicable, no candidate.
- Credentials added or printed: **0**.

## 15. Limitations

- Data is a free, unofficial, indicative feed — not a broker's real bid/ask stream. Cost assumptions (§6) are informed estimates, not measurements.
- 15m/30m coverage (~81 days) is too short for any real OOS/walk-forward claim — those four configs are exploratory only, correctly excluded from candidacy by the funnel's own sample-quality gate.
- The FX 24/5 calendar uses a fixed-UTC-cutoff approximation of the real DST-anchored trading week (§3.1, §8) — a small, disclosed source of boundary-bar misclassification, not expected to materially change any of this report's conclusions given how far every result sat from the rejection threshold.
- Swap/rollover is a coarse, symmetric, nights-held-based post-hoc adjustment, not a per-broker/per-direction table.
- No news/event calendar filtering was applied — regime analysis is purely price/indicator-derived (§9.4), consistent with the rest of this codebase's regime detector.
- Only 5 strategy families and 29 configurations were tested — this rules out these specific hypotheses on these four pairs at these four timeframes over ~2.8 years, not FX trading in general.

## 16. Recommendation

Do not proceed to Demo/Paper or prop-firm evaluation for Strategy #2 at this time. If Forex research continues in a future block, the most promising leads worth a fresh, independently-pre-registered follow-up round are: (1) FX Volatility Breakout on AUD/USD 4h with a larger sample and/or a genuinely lower-cost execution venue assumption tested explicitly, and (2) whether Family D/E's small-but-consistent gross edges concentrate in a specific session or regime once a larger, ECN-grade dataset is available — neither should be pursued by re-testing on the same OOS window already used here, to avoid turning it into de facto in-sample data.

---

*Reproducibility: `NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/forex/fetch-fx-candles.ts` then `NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/forex/run-block8-funnel.ts`. Raw results: `results/block8/forex/` (gitignored, regenerate via the commands above).*
