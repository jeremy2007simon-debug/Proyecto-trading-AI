# Block 10 — C-A Shadow Integration & Forward Validation

> **Role note:** this block integrates C-A (`VERIFIED`, Block 9.y, spec hash `f6b860f5`) into NovaCore as visible Strategy #2 and starts **SHADOW FORWARD VALIDATION** — real signals computed on real data, decisions logged, hypothetical positions/fills/costs simulated explicitly, forward P&L computed and compared against benchmarks. **No real order of any kind is ever submitted.** RS3M (`RS3M_CANDIDATE_V1`, hash `1c28b57c`) is untouched — not modified, not re-verified, its Routine and Paper status unchanged.

## 1. Candidate spec — CA_CANDIDATE_V1

`src/core/ca-shadow/candidate.ts` re-exports `C_A_FROZEN_SPEC` (`src/core/strategy2-verification/candidate-specs.ts`, frozen in Block 9.y) unmodified, as `CA_CANDIDATE_V1`. Nothing about the strategy's economic parameters is redefined — only re-exported and re-hashed to confirm it still matches the independently pinned tripwire constant `EXPECTED_CA_CANDIDATE_V1_HASH = "f6b860f5"` (declared separately, never imported from the same module as the definition, exactly like RS3M's own `EXPECTED_RS3M_CANDIDATE_V1_HASH` pattern).

| Field | Value |
|---|---|
| Signal | Bottom-decile trailing-252-trading-day daily-return trigger |
| Market / Instrument | SP500 / SPY |
| Timeframe | 1D |
| Entry | At the trigger day's close |
| Exit | Unconditional, next trading day's close (always exactly 1 trading day held) |
| Position sizing | Full notional when triggered, 0% otherwise. No leverage. |
| Stop logic | None — risk is bounded by the 1-day hold, not a stop |
| Cost model | `SWING_ROUND_TRIP_BPS` (`src/core/us-index-research/cost-model.ts`): OPTIMISTIC 0bps, REALISTIC 3bps, STRESSED 10bps — reused unmodified |

Note: `CA_CANDIDATE_V1.candidateId` (the underlying frozen spec's own field) is `"C-A"` — the short Block 9.x/9.y research label. NovaCore's own strategy id, used in the Bots list, the detail-page URL, and every NovaCore-level reference, is the literal string `"CA_CANDIDATE_V1"` (per this block's own brief, §5: `/novacore/bots/CA_CANDIDATE_V1`). Both are cross-referenced in the Strategy Hub adapter's `sourceOfTruth` so either id is traceable to the other — this is a naming difference, not two different candidates.

## 2. The canonical percentile decision

Block 9.y's independent reproduction of C-A found 4/8,194 trigger-day mismatches against the original implementation, explained by two different-but-standard percentile interpolation conventions (linear interpolation vs. nearest-rank) — reported there as an immaterial, EXPLAINED discrepancy.

**This block resolves that ambiguity permanently: the CANONICAL method is linear interpolation between the two bracketing order statistics** — the same method `short-term-reversal.ts`'s own `quantile()` uses, and therefore the method the actual `VERIFIED` candidate was evaluated under. Canonicalizing to nearest-rank instead would silently swap in a variant that was never itself independently verified end-to-end.

This does **not** change `CA_CANDIDATE_V1`'s hash — the hash covers the strategy's economic parameter values (lookback, decile threshold, cost assumptions), which are unchanged. The interpolation method is an implementation choice for computing an unambiguously named but multiply-realizable statistic ("bottom decile"), pinned by a dedicated, tested code path (`src/core/ca-shadow/canonical-signal.ts`) instead of by inflating what the spec hash is meant to detect.

A second, subtler ambiguity was resolved during this block's own test-writing: the original's 252-day trailing window **excludes** the decision day's own return (`window = returns.slice(i-1-lookback, i-1)`, never `returns[i-1]` itself) — a fact the original file's own doc comment states imprecisely, but its actual index arithmetic is unambiguous. `canonical-signal.ts` matches the code, not the doc comment.

`tests/core/ca-shadow/canonical-signal.test.ts` proves this module reproduces the original's day-by-day trigger flags **EXACTLY** (0 discrepancies) on both large synthetic data (1,500 days) and real SPY data (`results/block9b/datasets/SPY_1d.json`, 8,000+ days) — tighter than Block 9.y's own "4/8194, explained" bar. Getting the date alignment right required a second, related fix: the original's per-row `date` field records the **exit** day, one trading day after the day whose return was actually tested — the test's own comparison logic had to shift by one index to compare like with like; this was a test-authoring bug caught and fixed while building this reproduction, not a discrepancy in the strategy logic itself.

## 3. Architecture

```
market data (Alpaca/Yahoo)
        │
        ▼
canonical-signal.ts  (pure, canonical percentile/trigger evaluator)
        │
        ▼
safety-guards.ts     (hash, duplicate-date, freshness, price, history, adjustment)
        │
        ▼
shadow-engine.ts     (pure pipeline: signal → execution assumption → hypothetical
        │              fill → shadow position → shadow P&L)
        ▼
evidence-store.ts    (append-only JSONL ledgers, results/block10/ca-forward/**)
        │
        ├──▶ notification-events.ts → notifications/dispatcher.ts (console)
        └──▶ NovaCore adapters (read-only) → Bots list, C-A detail page, Activity feed
```

Every arrow above is one-directional: data flows toward evidence and toward NovaCore's read-only display layer. **Nothing in this diagram can submit an order** — `shadow-engine.ts` and everything it imports (`canonical-signal.ts`, `candidate.ts`, `safety-guards.ts`, `cost-model.ts`) contain zero references to `@/core/execution/*`, proven statically by `tests/core/ca-shadow/no-broker-writes.test.ts` (which strips comments before scanning, so the many doc comments that name the forbidden module for explanatory purposes don't trip a false positive — only live code references would).

`shadow-engine.ts` has **zero I/O**, matching `rs3m-engine.ts`'s own convention: candles, prior shadow state, and "now" are all injected as plain values. The actual data fetch (`scripts/block10/ca-shadow/fetch-ca-market-data.ts`) and evidence persistence (`scripts/block10/ca-shadow/evidence-store.ts`) live in the script/routine layer.

## 4. Forward start

`src/core/ca-shadow/forward-start.ts` declares `CA_FORWARD_START_TIMESTAMP = "2026-08-23T00:00:00.000Z"` — the exact instant this block is frozen. `isBeforeCaForwardStart()` is checked by the routine script before ever writing forward evidence: **no retroactive backfill of recent months disguised as forward evidence.** Forward evidence begins strictly after this instant, whatever the actual data available before it might show.

## 5. Data

`scripts/block10/ca-shadow/fetch-ca-market-data.ts` prioritizes Alpaca (`adjustment: "all"`, i.e. split+dividend adjusted close — `EXPECTED_CA_DATA_ADJUSTMENT = "SPLIT_AND_DIVIDEND_ADJUSTED_CLOSE"`) when `ALPACA_API_KEY_ID`/`ALPACA_API_SECRET_KEY` are configured; otherwise falls back to Yahoo Finance, using the exact same endpoint, parameters, and adjusted-close conversion Block 9.x/9.y's own verification used (`scripts/research/strategy2/fetch-block9b-data.ts`). Every `ShadowDayResult` records `dataSource` and `dataAdjustment` explicitly — the pipeline never silently switches source or convention. An `ADJUSTMENT_MISMATCH` safety guard (`safety-guards.ts`) fails closed if a fetch ever reports a different convention than the one C-A was verified under.

## 6. Scheduler (daily Routine)

`scripts/block10/ca-shadow/run-ca-shadow-routine.ts` is a **separate** script from RS3M's `run-rebalance.ts` — never touches it, its Routine, or `results/block6/**`. Designed to be fired daily (after NYSE close) by its own Routine:

1. Skip on a non-trading day or before ~16:00 America/New_York (the bar isn't closed yet).
2. Fetch market data (Alpaca-preferring, Yahoo-fallback).
3. Reconstruct prior shadow state from the append-only evidence ledger (`evidence-store.ts#readLastShadowState`) — there is deliberately no separate mutable "current state" file; the ledger's last non-`BLOCKED` row IS the state.
4. Refuse anything dated on/before the forward-start instant.
5. Fast no-op if the last available bar's date was already processed (idempotency pre-check, mirrors RS3M's own "already executed" check).
6. `evaluateShadowDay()` — canonical signal, every safety guard, hypothetical fill.
7. Append evidence (every attempt, including `BLOCKED` ones — never dropped).
8. Fan out non-spammy notifications.
9. Never submit an order.

**Idempotency (§13):** the same decision date can never be processed twice. `evaluateShadowDay`'s own `DUPLICATE_DATE` guard is backed by the durable, already-`appendFileSync`'d evidence ledger — never an in-memory flag a restart could lose. A `BLOCKED` day (e.g. transient `DATA_STALE`) deliberately does **not** advance `lastProcessedDate`, so it can be legitimately retried once the underlying problem clears; `readLastShadowState()` reconstructs state by skipping trailing `BLOCKED` rows for exactly this reason.

## 7. Shadow execution & fills

Execution timing (frozen, matches the original backtest's own convention exactly, §10): the signal for "today" (the most recently closed bar) is evaluated from data ending at today's close. If triggered and currently FLAT, the hypothetical entry is booked **at today's close** — no price P&L on the entry day itself, cost charged upfront. If currently LONG (entered the prior processed day), the position closes **at today's close**, realizing the full close-to-close return. `hypotheticalFillPrice` always equals the reference (theoretical) price — **no optimistic slippage model** is introduced; round-trip friction is modeled entirely as `SWING_ROUND_TRIP_BPS` notional cost, unchanged from the verified backtest (§11/§22: the cost model is never adjusted to improve forward-looking performance).

## 8. Forward evidence

`results/block10/ca-forward/{signals,positions,fills,daily-equity,activity}/ledger.jsonl` — append-only JSONL, one writer (`evidence-store.ts#appendCaForwardEvidence`), never mixed with backtest/verification data. Every field §7 requires (timestamp, candidate id/hash, data cutoff, signal, percentile value/rank, entry/exit decision, theoretical price, hypothetical fill price, cost assumption, position before/after, shadow equity, SPY benchmark, warnings) is present because the evidence record **is** `ShadowDayResult` itself — not a hand-duplicated second shape.

`signals`/`daily-equity`/`activity` receive every processed day, including `BLOCKED` ones (a blocked attempt is still evidence). `positions`/`fills` receive only `ENTER`/`EXIT` days. `monthly-summary` is a **computed view** over `daily-equity` (`forward-evidence.ts#computeCaMonthlySummaries`), not a separately stored/duplicated ledger — recomputing on read avoids the correctness hazard of an append-once summary going stale after a late/corrected row, and avoids in-place rewriting of an append-only store.

Like `results/block6/forward/`, `results/block10/ca-forward/**` is gitignored (blanket `/results/*` ignore, no new carve-out needed) — it is machine-generated, regenerable output, not committed. **In this checkout, the ledger is empty**: the shadow Routine has not been registered/fired outside this coding session.

## 9. Forward metrics

`getCaShadowSnapshot()` (`src/novacore/strategy-hub/adapters/ca-shadow-snapshot-adapter.ts`) computes, read-only, from the evidence ledger: days processed, trades, blocked days, current hypothetical position, hypothetical equity, realized shadow P&L, current drawdown (running peak of `shadowEquityAfter`), and a same-period SPY benchmark return. With zero evidence, every one of these renders an honest "Sin datos" / "INSUFFICIENT FORWARD DATA" state — **never a fabricated number**, and never an annualized return computed from a couple of weeks as if it were ten years (§16).

## 10. Promotion bar (`src/core/ca-shadow/promotion-bar.ts`)

Defined and frozen in this same commit, **before any forward/shadow evidence exists** — the ledger this evaluates is empty at the time this file was written. Per §22, never tuned after the fact to fit an observed outcome.

Two deliberately separate concepts:

- **`OPERATIONAL_VERIFIED`** — does the shadow pipeline itself work correctly. Requires: ≥20 trading days actually processed (not blocked), zero `CANDIDATE_HASH_MISMATCH`/`ADJUSTMENT_MISMATCH` violations ever, no more than 3 consecutive `DATA_STALE` blocks, and a consistent cost assumption across every `ENTER`. **Says nothing about profitability.**
- **`FORWARD_EVIDENCE_SUFFICIENT`** — has enough calendar time (≥90 days since forward start) and enough actual completed trades (≥5) passed to say anything statistically meaningful. C-A trades infrequently (~27/year historically) — a single trade, or three weeks, is never declared a success on its own. **Also not a return bar** — §23 is explicit that the initial shadow goal is to verify operational behavior, not to clear an arbitrary return threshold over a few months.

Both being true only makes C-A **eligible** to be considered for a future, separate Paper-connection decision — `evaluateCaPromotionBar()` never itself promotes anything, and no such promotion mechanism exists in this codebase (see §12). The C-A detail page's SHADOW tab surfaces both flags and their underlying criteria live.

## 11. Limitations (disclosed, not hidden)

- Zero forward evidence exists in this checkout — every forward/shadow number shown by NovaCore is an honest empty state, not a demonstration of forward performance.
- The shadow Routine has not been registered as a live, firing cron trigger as part of this coding session — the script (`run-ca-shadow-routine.ts`) is built, tested, and ready, but nothing has actually invoked it against live market data yet. `CA_CANDIDATE_V1`'s status is therefore `SHADOW_READY`, not `SHADOW_RUNNING` (§31).
- `CA_FULL_HISTORY_METRICS.cagrPct` (3.95%) is derived from the report's own published total return (253.3%) and period (1994-01 to 2026-08) via the standard CAGR formula — the underlying report does not itself state a pre-computed CAGR figure. This is a deterministic transformation of already-published numbers, not an independently invented figure, and is documented as such in `ca-historical-metrics.ts`.
- The Portfolio Lab's forward-correlation and simulated-50/50-portfolio sections require overlapping FORWARD evidence from **both** RS3M (Paper) and C-A (Shadow) simultaneously — since RS3M's own `results/block6/forward/` ledger is also empty in this environment, that comparison is currently gated behind an honest "INSUFFICIENT FORWARD DATA" state.

## 12. Safety

- **No broker write imports anywhere in the shadow pipeline** — statically proven (`tests/core/ca-shadow/no-broker-writes.test.ts`), scanning every file under `src/core/ca-shadow/` and `scripts/block10/ca-shadow/` for any reference to `@/core/execution/*` or `alpaca-paper-client`'s exported symbols, with comments stripped so explanatory doc comments naming the forbidden module don't produce false positives.
- **No order submission** — `shadow-engine.ts`'s only outputs are a `ShadowDayResult` (evidence) and a `ShadowPriorState` (in-memory transition); neither is ever passed to anything execution-related.
- **No Paper connection** — no `submitOrder`, approval flow, broker write adapter, or position-sync exists for C-A. `PAPER_TRADING=true` is never read by any C-A code path.
- **LIVE remains structurally disabled** — as it is for the entire codebase (`src/core/execution/types.ts`); nothing in Block 10 changes that.
- **Candidate hash tripwire** — `EXPECTED_CA_CANDIDATE_V1_HASH` is declared separately from `CA_CANDIDATE_V1` itself, so an in-place edit of the frozen spec cannot silently pass by both the definition and the check reading the same (edited) value. Checked on every `evaluateShadowDay()` call.
- **RS3M isolation** — no file under `src/core/paper-trading/rs3m/**`, `scripts/block6/**`, or RS3M's own Routine/status/hash was read for modification, only re-imported where NovaCore needs to render both strategies side by side (Portfolio Lab, Home). RS3M's own hash (`1c28b57c`) is unchanged; verified by the existing RS3M test suite, all of which still passes.

## 13. NovaCore integration

- **Types**: `NovaCoreStrategyStatus` gains `SHADOW_READY`/`SHADOW_RUNNING`; `NovaCoreEnvironment` gains `SHADOW` (additive, `src/novacore/shared/types.ts`).
- **Strategy Hub**: `src/novacore/strategy-hub/adapters/ca-adapter.ts` (read-only, mirrors `rs3m-adapter.ts`'s discipline exactly) registers `CA_CANDIDATE_V1` as the registry's second entry (`registry.ts`).
- **Bots list** (`/novacore/bots`): C-A renders its own card — "Environment: SHADOW (no broker, no órdenes reales)", hypothetical position, shadow P&L, "Órdenes: 0" — visually distinct (purple accent) from RS3M's PAPER card.
- **C-A detail page** (`/novacore/bots/CA_CANDIDATE_V1`): 6 tabs — Overview, Rendimiento, Señal, Shadow, Riesgo, Actividad — rendered through the SAME `BotDetailTabs` component RS3M uses, generalized to accept a custom tab list (`tabs?: BotDetailTabDef[]`) rather than a second, parallel tab UI (§28).
- **Activity feed**: `ca-shadow-event-adapter.ts` maps the evidence ledger into `NovaCoreEvent`s using dedicated types (`SHADOW_INITIALIZED`, `SHADOW_POSITION_OPENED`, `SHADOW_POSITION_CLOSED`, `SHADOW_BLOCKED`) — deliberately NOT `ORDER_SUBMITTED`/`ORDER_FILLED`, which would blur the SHADOW-vs-PAPER distinction.
- **Home**: Strategies section shows both RS3M (PAPER) and C-A (SHADOW) mini-cards with visually distinct badges.
- **Market tab**: an optional "C-A signal context (SPY)" card shows current percentile rank and signal status, explicitly labeled "no es una recomendación de inversión" (§19).
- **Portfolio Lab** (`/novacore/portfolio-lab`, new): RS3M vs. C-A side by side — return, drawdown, correlation, signal overlap — never combined as shared capital. A "SIMULATED FORWARD PORTFOLIO (50/50)" section is gated behind a minimum overlapping-forward-days threshold and currently renders an honest "INSUFFICIENT FORWARD DATA" state.

## 14. Tests

`tests/core/ca-shadow/` (canonical signal exact reproduction — synthetic + real SPY data, shadow engine execution/guards, no-broker-writes static proof, forward evidence monthly summaries, notification event derivation, promotion bar) and `tests/scripts/block10/ca-shadow/` (evidence store append/read/state-reconstruction) plus `tests/novacore/strategy-hub/ca-adapter.test.ts` and `tests/novacore/events/ca-shadow-event-adapter.test.ts`. Every prior test in the repository (RS3M, Block 9.x/9.y, all other blocks) still passes.
