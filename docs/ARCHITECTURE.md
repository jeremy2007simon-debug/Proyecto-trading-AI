# Architecture — Trading Analysis Platform

## 1. Requirements analysis (summary)

This is a **private, analysis-first** trading platform. It classifies market
conditions, runs several independent strategies, combines their signals into
one decision, and enforces hard risk limits before ever calling something a
BUY or SELL. It does **not** trade real money and does **not** let any layer —
including the AI explanation layer — bypass the risk rules.

Hard constraints that shaped every decision below:

- **No LIVE broker connection, ever, no exception.** No real order backed by
  real money is ever placed by this codebase. This is absolute and does not
  change with Block 6 (below).
- **PAPER broker connection is permitted, starting with Block 6, under
  exhaustive guards** — and only for one specific, frozen, independently
  audited strategy candidate (`RS3M_CANDIDATE_V1`,
  `src/core/paper-trading/rs3m/candidate.ts`), never for signals from the
  Consensus/Signal Engine pipeline described below. This is a deliberate,
  narrow evolution of the original "no broker connection at all" constraint —
  not a relaxation of it. The connection is to Alpaca's PAPER Trading API
  (`https://paper-api.alpaca.markets/v2`) only:
  `src/core/execution/alpaca-paper-client.ts` hardcodes that URL as the
  file's ONLY base-URL constant (no env var or config path can point it at
  the live `api.alpaca.markets` endpoint — a structural guarantee, not a
  conditional), and `src/core/paper-trading/rs3m/safety-guards.ts` re-asserts
  this at runtime before any order-placing call, alongside a symbol
  whitelist (SPY/QQQ/IWM/DIA only), no leverage/shorts/options/margin, and
  duplicate-order/idempotency protection. See
  `docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md` for the full audit and
  which of `PAPER_READY`/`PAPER_RUNNING`/`REJECTED` currently applies.
- The `Execution` module below (`src/core/execution/types.ts`,
  `ExecutionEngine`) remains a disabled, unimplemented interface tied to the
  Consensus/Signal Engine pipeline's `FinalSignal` — it is unrelated to the
  RS3M paper client above, which is a separate, narrowly-scoped module that
  intentionally does not implement `ExecutionEngine` (RS3M does not go
  through the Consensus Engine). `ExecutionEngine` continues to represent
  real, LIVE execution, which stays out of scope entirely.
- The Risk Engine is the single choke point between "the system wants to
  trade" and "the system may say BUY/SELL". Nothing may bypass it.
- The AI layer explains; it never decides, sizes, or executes
  (`src/core/ai-layer/types.ts` documents the exact boundary).
- Every module must be addable/extensible without modifying the others
  (new markets, new strategies, new regimes).

## 2. Pipeline

```
Market Data  →  Market Regime Detector  →  Strategy Manager
   →  Individual Strategies  →  Consensus Engine  →  Risk Engine
   →  Final Signal  →  AI Explanation  →  Paper Trading
```

Each arrow is a typed interface boundary in `src/core/**/types.ts`. A module
only ever depends on the interfaces of the modules to its left; nothing
depends on a concrete implementation of another module. This is what lets a
new strategy, a new market, or a new regime rule ship without touching the
Consensus Engine or Risk Engine.

## 3. Module map

| Module | Path | Status in this delivery |
|---|---|---|
| Shared types | `src/core/shared` | Implemented |
| Market Hours | `src/core/market-hours` | **Implemented** — NYSE calendar (DST, RTH/pre/after, holidays) |
| Market Data | `src/core/market-data` | **Implemented** — `MarketDataProvider` + Alpaca adapter (SPY) |
| Indicators | `src/core/indicators` | **Implemented** — EMA, SMA, RSI, ATR, VWAP, MACD, ADX, Volume Average, Realized Volatility |
| Data Quality | `src/core/data-quality` | **Implemented** — rule-based `DataQualityEngine` |
| Market Regime | `src/core/market-regime` | **Implemented** — rule-based detector with confirmation-bar hysteresis |
| Strategy Manager | `src/core/strategy-manager` | Interface + registration model — 5 strategies pending |
| Consensus Engine | `src/core/consensus-engine` | Interface + scoring model |
| Risk Engine | `src/core/risk-engine` | Interface + hard-coded default rules |
| Signal Engine | `src/core/signal-engine` | Interface + quality-gate helper |
| Backtesting | `src/core/backtesting` | Interface + metrics shape |
| Paper Trading | `src/core/paper-trading` | Interface |
| Execution | `src/core/execution` | Interface only, explicitly disabled |
| Notifications | `src/core/notifications` | Interface |
| AI Layer | `src/core/ai-layer` | Interface with an explicit capability boundary |
| Logging | `src/core/logging` | Interface + canonical event list |
| Dashboard | `src/app/(dashboard)`, `src/components` | Dashboard/Market/Market Regime run on real data; Strategies/Signals still mock (pending Strategy Manager) |
| Database | `supabase/migrations` | Implemented (`0001` schema + `0002` provider identity) |

## 4. Why the Risk Engine sits where it does

`ConsensusEngine.evaluate()` can produce a BUY/SELL candidate purely from
strategy agreement. That candidate is not tradeable on its own —
`RiskEngine.evaluate()` must approve it first. If it rejects the candidate,
the Signal Engine forces `direction = "WAIT"` regardless of the consensus
score. This mirrors `final_signals.risk_approved` in the database: a BUY/SELL
row can only exist when that column is `true`.

## 5. Adding a new market or strategy

- **New market**: add a value to the `Market` union
  (`src/core/shared/types.ts`) and to the `market_enum` Postgres type, seed a
  row in `markets`. No other module changes.
- **New strategy**: implement the `Strategy` interface
  (`src/core/strategy-manager/types.ts`) and register it with the
  `StrategyManager`. The Consensus Engine and Risk Engine need no changes —
  they only ever see `StrategySignal[]`.

## 6. Mock data policy

Nothing in this delivery pretends to be live where a real implementation
exists. Any mock dataset still in use lives in `src/lib/mock/*.mock.ts`,
exports `IS_MOCK_DATA = true as const`, and every component/page that renders
it also renders `<MockDataBadge />`. As of this delivery, `Dashboard`,
`Market`, and `Market Regime` no longer use mock data at all — `Strategies`
and `Signals` still do, pending the Strategy Manager / Consensus Engine
implementation. `StrategyMatrix` and `ConsensusPanel` remain presentational
components that only know about their props, never about the mock module, so
swapping them to live data later is a page-level change only.

## 7. Market data provider decision

**Instrument**: the logical market `SP500` is backed by the **SPY ETF**, not
the raw index (`^GSPC`, which has no real trading volume of its own) and not
an ES future or a CFD. This mapping lives in code
(`src/core/market-data/instruments.ts`), not in the `markets` table — see
that file's comments for why. VWAP and volume-based indicators use SPY's
real traded volume.

**Provider comparison** (Alpha Vantage, Twelve Data, Polygon.io, Alpaca —
evaluated on historical intraday depth, real-time availability, volume
quality, API limits, reliability, cost, and integration effort):

| Provider | Historical intraday | Real-time | Volume quality | Cost for this use case | Integration effort |
|---|---|---|---|---|---|
| Alpha Vantage | Available, shallower on the free tier | Delayed on free tier | Mixed for intraday | Free tier historically very rate-limited | Simple REST |
| Twelve Data | Good documented depth | Paid-tier WebSocket | Generally solid | Usable free tier for light polling | Simple REST |
| Polygon.io | Best-in-class, tick-level | Reliable | High fidelity | Real-time US equities require a paid plan | More setup |
| **Alpaca Market Data API** (chosen) | Decent bars via the free IEX feed | Free IEX WebSocket feed | Good for SPY specifically | Free — account creation only, no funding/trading permissions needed | Easiest for this exact use case |

**Chosen: Alpaca Market Data API**, `iex` feed. It's the best fit specifically
*because* the instrument is SPY: no brokerage funding is required for market
data access (this project never uses Alpaca's Trading API), and IEX-sourced
bars are adequate for research-phase EMA/RSI/ATR/VWAP/ADX/MACD work. Known
limitations: `iex` is not the full consolidated tape (a small fraction of US
equity volume), so volume-based indicators reflect IEX volume, not total
market volume — documented in `src/core/market-data/providers/alpaca.adapter.ts`.
Free-tier rate limits and exact historical depth should be re-verified in
Alpaca's docs at deploy time (they change independently of this codebase);
the adapter retries with exponential backoff on `429`/5xx regardless of the
exact limit.

## 8. Fail-safe boundary

`src/lib/data/market-overview.server.ts` (`getMarketOverview`) is the single
function both the dashboard and the internal API routes call for a live
snapshot. It returns a typed `Result` — `{ ok: false, error }` — and never
throws, never returns partial data, and never falls back to mock data, on
any of: an unconfigured provider, a fetch failure, or a Data Quality **FAIL**
(`toMarketDataValidFlag`, `src/core/data-quality/types.ts`). Pages render
`<DataUnavailableNotice reason={...} />` in that case. The same principle is
what will drive `SignalQualityGate.marketDataValid` once `SignalEngine` is
implemented: no market data confidence, no BUY/SELL — the pipeline is forced
to WAIT.

## 9. Market Regime Detector — hysteresis

`RuleBasedRegimeDetector.detect()` must stay synchronous and stateless per
its interface contract, so "minimum regime duration" hysteresis (which would
need external state) isn't used. Instead it recomputes raw, per-bar
classifications for a trailing window from `input.candles` itself and only
"confirms" a regime change once the same classification has held for
`CONFIRMATION_BARS` (3) consecutive bars — this needs no state outside a
single call. See `src/core/market-regime/rule-based-regime-detector.ts` for
the five sub-scores (`trendScore`, `volatilityScore`, `breakoutScore`,
`rangeScore`, `momentumScore`) and the classification precedence.
