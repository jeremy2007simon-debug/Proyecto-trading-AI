# Block 7 — NovaCore Trading Lab Foundation

This block does not change the existing trading engine (Blocks 1-6). It adds a new,
separate control-plane layer — `src/novacore/**` — that reads, aggregates, and
presents what already exists (research reports, the frozen RS3M candidate, its
paper-trading infrastructure) without touching any of it. Everything here is
**observability before control**: no button anywhere in this delivery can place,
approve, or modify an order, a strategy, or a status.

## 1. Architecture

```
                    NOVACORE (src/novacore/**)
                 Control / Observability Plane
                      │
        ┌─────────────┼─────────────┐
        │             │             │
   Research Lab   Strategy Hub   Execution Center
        │             │             │
        └─────────────┼─────────────┘
                      │
               Risk & Analytics · Health · Events
                      │
        Broker abstraction (BrokerAdapter, read-only)
                      │
        ┌─────────────┼─────────────┐
        │                           │
      Alpaca PAPER              Future brokers
   (existing Block 6 client,     (MT5, prop firms —
    wrapped read-only)            not built here)
```

NovaCore consumes Blocks 1-6 (`src/core/**`, `scripts/block6/**`,
`docs/BLOCK4*/BLOCK5*/BLOCK6*.md`) as its data sources. It never reimplements
strategy logic, never recomputes a metric a report already publishes, and never
imports a write-side function from Block 6 (`writeApproval`, `appendForwardEvidence`,
`markExecuted`, `submitNotionalOrder`, or the scripts that call them). This is
enforced both by convention and by a static test —
`tests/novacore/read-only-guarantees.test.ts` greps every file under
`src/novacore/**` and `src/app/api/novacore/**` for those identifiers/imports and
fails the build if one appears.

## 2. Modules

| Module | Path | Responsibility |
|---|---|---|
| Shared types | `src/novacore/shared/types.ts` | `NovaCoreStrategy`, status/environment/health unions |
| Strategy Hub | `src/novacore/strategy-hub/**` | Registry + read-only adapters (RS3M today) |
| Research Lab | `src/novacore/research-lab/**` | `ResearchProject` rollups over Block 4/4.5/5 reports |
| Execution Center | `src/novacore/execution-center/**` | Broker/position/order/approval/routine snapshot |
| Risk & Analytics | `src/novacore/risk-analytics/**` | Historical + OOS + forward + cost metrics |
| Health | `src/novacore/health/**` | Pure health combinator + RS3M health adapter |
| Events | `src/novacore/events/**` | Common `NovaCoreEvent` vocabulary + adapters |
| Activity Feed | `src/novacore/activity-feed/**` | Merges every event adapter into one timeline |
| Portfolio | `src/novacore/portfolio/**` | Read-only cross-broker/account/position aggregation |
| Broker abstraction | `src/novacore/broker/**` | `BrokerAdapter` interface + Alpaca-paper read-only adapter |
| Prop Firm | `src/novacore/prop-firm/types.ts` | `TradingProgramConstraintSet` type only — no FTMO values |

Each module has its own `types.ts` and one adapter per real data source under
`adapters/`. Adding "Strategy #2" later means adding one more adapter file per
module — none of the existing adapters change.

## 3. Strategy Hub

`NovaCoreStrategy` (`src/novacore/shared/types.ts`) is the unified shape every
strategy is represented as, close to the interface sketched in the Block 7 brief
but with every performance/risk field optional — a field is only populated when a
real source has real evidence for it. `src/novacore/strategy-hub/registry.ts`
lists every known strategy; today that's exactly one entry, built by
`adapters/rs3m-adapter.ts`.

## 4. RS3M as the first Strategy Hub entry — read-only adapter

`src/novacore/strategy-hub/adapters/rs3m-adapter.ts` builds a `NovaCoreStrategy`
for `RS3M_CANDIDATE_V1` by **reading**, never duplicating:

- `src/core/paper-trading/rs3m/candidate.ts` — the frozen definition and
  `computeCandidateHash` (recomputed here only to CONFIRM it matches the
  independently-pinned `EXPECTED_RS3M_CANDIDATE_V1_HASH` in `safety-guards.ts` —
  exactly the same check `safety-guards.ts` performs before a real order, never a
  new value).
- `src/novacore/strategy-hub/adapters/rs3m-status-reader.ts` — a new, read-only
  reader for `results/block6/candidate/rs3m-v1-status.json` (written exclusively by
  `scripts/block6/write-status.ts`, which NovaCore never imports or calls). That
  file is gitignored and environment-specific; when it's absent (true in a fresh
  checkout, including this one), the adapter falls back to the status documented in
  `docs/RS3M_FORWARD_PAPER_TRACKING.md` (`PAPER_READY`) and says explicitly, in the
  strategy's own `sourceOfTruth` map, that it's using the doc fallback rather than a
  live read.
- `scripts/block6/paper/forward-evidence-store.ts#readForwardEvidenceLedger` — the
  real forward evidence ledger. In this environment it's empty (0 `EXECUTED` rows),
  so the adapter reports 0 months observed and 0 orders submitted, honestly — it
  never invents a position, a signal, or a P&L number.

The candidate's own strategy code, hash, universe, ranking, rebalance logic,
execution assumptions, safety guards, approval gate, forward-evidence store, and
the RS3M Routine are **byte-for-byte unmodified** by this block. See section 14.

## 5. Research Lab

`src/novacore/research-lab/types.ts` defines `ResearchProject`.
`adapters/block-research-adapter.ts` transcribes (never recomputes) two projects
from the frozen reports:

- **`ETF_ROTATION_RESEARCH`** (Block 5): 24 hypotheses, 22 rejected, 1 in research
  (6-month lookback), 1 candidate (3-month lookback — this became
  `RS3M_CANDIDATE_V1`). Source: `docs/BLOCK5_STRATEGY_DISCOVERY_REPORT.md` §1-10.
- **`SP500_LEGACY_STRATEGY_RESEARCH`** (Blocks 3/4/4.5): 5 hypotheses, 5 rejected —
  the original Trend Following/Breakout/Mean Reversion/ORB/VWAP strategies, with
  Mean Reversion and ORB's 42+-combination deep-validation follow-up in Block 4.5
  confirming "NO VALID STRATEGY FOUND". Source:
  `docs/BLOCK4_BACKTESTING_REPORT.md` §15, `docs/BLOCK4_5_STRATEGY_RESEARCH_REPORT.md` §15.

A test (`tests/novacore/research-lab/block-research-adapter.test.ts`) asserts
`rejected + research + candidates === hypothesesTotal` for every project.

## 6. Execution Center

`src/novacore/execution-center/adapters/rs3m-execution-adapter.ts` is READ /
MONITOR only — no button anywhere calls into it that could place, approve, or
cancel anything. It computes the current NYSE decision month with the existing,
pure `scripts/block6/paper/scheduling.ts#determineRebalanceTarget`, then reads
(never writes) `approval-store.ts#readApproval` /`#hasAwaitingApprovalMarker` and
`forward-evidence-store.ts#readForwardEvidenceLedger` to report: current position
(`CASH` — no `EXECUTED` row exists yet in this environment), last known signal
(none recorded), orders submitted (0), and approval state for the current decision
month. Routine health is reported from the documented validation record in
`docs/RS3M_FORWARD_PAPER_TRACKING.md`, with an explicit note that live Routine
health (the scheduled trigger itself) is not observable from inside this
application.

## 7. Risk & Analytics

`src/novacore/risk-analytics/adapters/rs3m-historical-metrics.ts` transcribes the
full-history (124-month) and last-25-month OOS figures directly from
`docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md` §10-12 and §17, citing the exact
section next to every number. Critically, the **OOS underperformance finding**
(-26.87pp excess vs. SPY, -14.03% annualized alpha, inverted capture ratio) is
always surfaced alongside the favorable full-history numbers, never omitted — see
`RS3M_OOS_LAST_25_MONTHS_METRICS`'s `note` field and every dashboard page that
renders it (`/novacore`, `/novacore/strategies/RS3M_CANDIDATE_V1`, `/novacore/risk`).

Forward metrics reuse the existing, unmodified
`src/core/paper-trading/rs3m/forward-performance.ts#computeForwardPerformance`
applied to the real ledger. With fewer than 2 `EXECUTED` months (0, currently),
the adapter reports `available: false` with the reason rather than computing a
CAGR/drawdown series from an empty or single-point curve.

## 8. Event System

`src/novacore/events/types.ts` defines the common vocabulary from the Block 7
brief (`STRATEGY_SIGNAL`, `STRATEGY_STATUS_CHANGED`, `ORDER_PLANNED`,
`ORDER_SUBMITTED`, `ORDER_FILLED`, `ORDER_REJECTED`, `GUARD_BLOCKED`,
`RESEARCH_EXPERIMENT_COMPLETED`, `CANDIDATE_CREATED`, `SYSTEM_WARNING`,
`SYSTEM_ERROR`). This is additive: it does not touch
`src/core/paper-trading/rs3m/notification-events.ts` (Block 6's own event type,
which stays exactly as it is) or `scripts/block6/paper/event-log.ts`. Two
adapters map existing sources into this shape: `rs3m-event-adapter.ts` (status
transitions + forward-evidence ledger rows) and `research-event-adapter.ts`
(one `RESEARCH_EXPERIMENT_COMPLETED` per project + RS3M's `CANDIDATE_CREATED`).

## 9. Activity Feed

`src/novacore/activity-feed/build-activity-feed.ts` merges every event adapter,
sorts newest-first, and supports a domain filter (`research` / `strategy` /
`execution` / `system`) and a limit. Rendered at `/novacore/activity` with domain
filter chips, and summarized (last 6 events) on the NovaCore home page. No secrets
appear in any event — enforced by
`tests/novacore/activity-feed/build-activity-feed.test.ts`.

## 10. Broker abstraction

`src/novacore/broker/types.ts` defines `BrokerAdapter` — `getAccount`,
`getPositions`, `getOrders`, `getHealth`, and deliberately **no order-submission
method** (the interface itself has no code path that could place an order).
`adapters/alpaca-paper-broker-adapter.ts` (well, `broker/alpaca-paper-broker-adapter.ts`)
wraps the existing `createAlpacaPaperTradingClient` and only ever calls its read
methods; `submitNotionalOrder` is never referenced. This is today's only
implementation — no MT5 or prop-firm broker is built in this block, but any future
one only needs to satisfy this same interface for the rest of NovaCore (Portfolio,
Execution Center) to consume it unchanged.

## 11. Dashboard

Mobile-first, dark (reuses the existing Tailwind tokens/`AppShell`/`Sidebar`/
`PageHeader`/`StatTile`/`Card` — no new design system). Routes, all read-only:

| Route | Content |
|---|---|
| `/novacore` | System status, Strategy Hub summary, RS3M vs. SPY headline metrics, recent activity |
| `/novacore/strategies` | Strategy Hub card list |
| `/novacore/strategies/[id]` | Full detail: hypothesis, historical + OOS metrics, execution, health, source of truth |
| `/novacore/research` | Research project rollups |
| `/novacore/execution` | Broker/account/position/orders/approval/routine |
| `/novacore/risk` | Historical/forward/OOS/execution/cost metrics |
| `/novacore/activity` | Filterable event timeline |

The sidebar gets a new "NovaCore" section (`src/lib/navigation.ts`'s
`NOVACORE_NAV_ITEMS`) below the existing legacy nav items — the legacy dashboard
(`/`, `/strategies`, `/paper-trading`, ...) is untouched.

## 12. APIs

`/api/novacore/{system,portfolio,strategies,strategies/[id],research,execution,risk,activity}`
— all **GET-only** (no route file exports POST/PUT/DELETE/PATCH; asserted by
`tests/app/api/novacore/routes.test.ts`). Deliberately a separate namespace from
`/api/strategies` / `/api/strategies/[id]`, which belong to the pre-existing
Consensus/Signal Strategy Manager (mock-data-driven per `docs/ARCHITECTURE.md` §6)
— overloading those routes would have conflated two unrelated systems. Every route
uses the existing `createSlidingWindowRateLimiter` convention.

## 13. Security

- No API route or page ever returns a credential value — `BrokerHealth` reports
  only `credentialsConfigured: boolean`. `tests/novacore/no-secrets-exposure.test.ts`
  sets fake credentials and asserts they never appear in any adapter's serialized
  output.
- The Alpaca PAPER broker adapter fails closed (typed error, never a throw or
  fabricated data) when credentials aren't configured — the actual state of this
  environment today.
- Every NovaCore module that touches the filesystem or credentials is guarded with
  `import "server-only"`, matching the existing `src/lib/data/*.server.ts`
  convention (enforced at Next.js build time; `tests/stubs/server-only.ts` +
  `vitest.config.mts`'s alias let vitest exercise these modules directly without
  weakening that guarantee in the real build).
- No authentication is added in this block — this dashboard is not deployed
  publicly. **Documented gap**: before any non-local deployment, an auth layer
  (Supabase Auth is already a project dependency) must sit in front of both the
  existing dashboard and `/novacore/**`.
- **LIVE status**: unchanged and unchanged-by-construction. `ExecutionEngine`
  (`src/core/execution/types.ts`) remains unimplemented; `alpaca-paper-client.ts`
  still has exactly one base-URL constant, still paper-only; NovaCore adds no new
  broker credential path and no new order-submission code path anywhere.

## 14. RS3M isolation — what was and wasn't touched

**Not modified, anywhere in this block**: `src/core/paper-trading/rs3m/**`,
`scripts/block6/**`, `RS3M_CANDIDATE_V1`'s hash (`1c28b57c`), the RS3M Routine, the
approval gate, the safety guards, the forward-evidence store's writer, the
strategy/lookback/universe/ranking/rebalance/execution-assumption code.

**Verification**:
- `tests/core/paper-trading/rs3m/candidate.test.ts` (pre-existing, unmodified) still
  pins the hash to `1c28b57c` and still passes.
- `tests/novacore/read-only-guarantees.test.ts` (new) statically greps every
  NovaCore file for the write-side identifiers/imports and fails if any appear.
- `tests/novacore/strategy-hub/rs3m-adapter.test.ts` (new) asserts the adapter's
  reported hash equals `EXPECTED_RS3M_CANDIDATE_V1_HASH` from `safety-guards.ts`.
- The full pre-existing test suite (673 tests, all of Blocks 1-6) still passes
  unchanged — see the Tests section below.
- `git diff` for this branch touches only new files under `src/novacore/**`,
  `src/app/api/novacore/**`, `src/app/(dashboard)/novacore/**`,
  `src/components/novacore/**`, `tests/novacore/**`, `tests/app/api/novacore/**`,
  `tests/stubs/**`, plus additive edits to `src/lib/navigation.ts`,
  `src/components/layout/Sidebar.tsx` (new nav section), `vitest.config.mts` (test
  alias), and this doc / `docs/ARCHITECTURE.md`.

## 15. Future mobile architecture

NovaCore's data layer already exists behind `/api/novacore/**` as plain JSON, not
tied to server-rendered pages — a future native app (or a thin React Native/Expo
client) can consume the same endpoints without any backend change. The Activity
Feed's flat, timestamp-sorted `NovaCoreEvent[]` shape is deliberately push-notification
friendly (a title + summary + domain per event) for when mobile push is built.

## 16. Future Prop Firm integration (Block 8 preview)

`src/novacore/prop-firm/types.ts#TradingProgramConstraintSet` is a generic shape
(profit target, daily loss limit, max loss, minimum trading days, allowed
instruments, overnight/weekend/news/automation rules) with **zero FTMO-specific
values anywhere in the codebase**. Block 8 would populate a concrete instance from
verified program rules and build a dedicated Prop Firm Research Lab — not started
here.

## 17. Limitations

- RS3M's live status (`Rs3mStatus`) can only be read from
  `results/block6/candidate/rs3m-v1-status.json`, which is gitignored and absent in
  this environment — the dashboard currently shows the documented `PAPER_READY`
  fallback rather than a guaranteed-live value. Once that file exists in a given
  deployment, the adapter picks it up automatically with no code change.
- No live Alpaca credentials are configured in this environment (matches
  `docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md` §21) — Execution Center/Portfolio
  broker reads report `credentialsConfigured: false` rather than real account data.
- No authentication in front of the dashboard (see Security).
- No caching layer beyond Next.js defaults — acceptable at today's data volume
  (a handful of file reads per request, no live backtests), revisit if that changes.
- Research Lab currently has 2 hand-transcribed projects; a future block could
  parse `results/block5/**` programmatically when that data is reliably present.

## 18. Block 8 recommendation

Per the brief: **Block 8 — Prop Firm Research Engine**, a separate research
environment to find a Strategy #2 optimized for evaluation pass probability,
funded-account retention, expected payout, and drawdown survival under configurable
prop-firm rules (FTMO 2-Step Swing as a candidate first program, rules to be
re-verified before implementation). Not started in this block.

---

## Tests / Lint / Typecheck / Build

- `npm run test` — 715/715 passing (673 pre-existing Blocks 1-6 tests unchanged +
  42 new NovaCore tests).
- `npm run lint` — 0 errors, 0 warnings.
- `npm run typecheck` — 0 errors.
- `npm run build` — succeeds; every `/novacore/**` route and `/api/novacore/**`
  route compiles and is listed in the route manifest.

## Source of truth

| Data | Authoritative source |
|---|---|
| Strategy definition | `src/core/paper-trading/rs3m/candidate.ts` (frozen) |
| Candidate hash | `EXPECTED_RS3M_CANDIDATE_V1_HASH` in `safety-guards.ts` |
| Live operational status | `results/block6/candidate/rs3m-v1-status.json` (falls back to `docs/RS3M_FORWARD_PAPER_TRACKING.md` when absent) |
| Broker account/positions/orders | Alpaca PAPER API, read-only |
| Forward evidence | `results/block6/forward/ledger.jsonl` (read-only) |
| Historical/OOS metrics | `docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md` |
| Research rollups | `docs/BLOCK4_BACKTESTING_REPORT.md`, `docs/BLOCK4_5_STRATEGY_RESEARCH_REPORT.md`, `docs/BLOCK5_STRATEGY_DISCOVERY_REPORT.md` |
| System health | `src/novacore/health/**` (never a proxy for performance) |
