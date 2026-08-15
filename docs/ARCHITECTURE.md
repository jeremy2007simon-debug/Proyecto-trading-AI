# Architecture — Trading Analysis Platform

## 1. Requirements analysis (summary)

This is a **private, analysis-first** trading platform. It classifies market
conditions, runs several independent strategies, combines their signals into
one decision, and enforces hard risk limits before ever calling something a
BUY or SELL. It does **not** trade real money, does **not** connect to a
broker, and does **not** let any layer — including the AI explanation layer —
bypass the risk rules.

Hard constraints that shaped every decision below:

- No real broker connection. No real order is ever placed by this codebase.
- The `Execution` module exists only as a disabled, unimplemented interface
  (`src/core/execution/types.ts`).
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
| Market Data | `src/core/market-data` | Interface only — no live provider yet |
| Indicators | `src/core/indicators` | Interface only — no concrete indicators yet |
| Market Regime | `src/core/market-regime` | Interface + regime taxonomy — detector logic pending |
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
| Dashboard | `src/app/(dashboard)`, `src/components` | Implemented, mock data clearly marked |
| Database | `supabase/migrations` | Implemented |

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

Nothing in this delivery pretends to be live. Every mock dataset lives in
`src/lib/mock/*.mock.ts`, exports `IS_MOCK_DATA = true as const`, and every
component/page that renders it also renders `<MockDataBadge />`. Swapping to
real data means changing the page that fetches it — `StrategyMatrix` and
`ConsensusPanel` are presentational components that only know about their
props, never about the mock module.
