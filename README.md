# Trading Analysis Platform

Private, quantitative signal analysis platform for the S&P 500. Classifies
market regime, runs independent strategies, combines them into a consensus,
and enforces hard risk limits before ever surfacing a BUY or SELL.

**This version does not trade real money, does not connect to any broker,
and does not execute any order.** See `docs/ARCHITECTURE.md` for the full
system design and `src/core/execution/types.ts` for why the Execution
module is intentionally unimplemented.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + Auth)
- Vitest + Testing Library
- Hosting: Vercel

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project credentials
npm run dev
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |

## Database

Apply `supabase/migrations/0001_init_schema.sql` to a Supabase project (SQL
editor, or `supabase db push` if you have the CLI linked). It creates all
core tables (`markets`, `market_candles`, `market_regimes`, `strategies`,
`strategy_signals`, `consensus_signals`, `final_signals`, `paper_trades`,
`backtest_runs`, `risk_events`, `system_logs`, ...) with Row Level Security
enabled.

## Project structure

```
src/
  app/(dashboard)/     Dashboard pages (Strategies, Signals, Market Regime, ...)
  app/api/webhooks/     TradingView webhook skeleton (validated, not wired to execution)
  components/          UI, layout, and domain-specific presentational components
  core/                 Domain modules — one folder per module, typed interfaces only
  lib/                  Supabase clients, navigation config, mock data
supabase/migrations/     SQL schema
docs/ARCHITECTURE.md      Full architecture write-up
```

Mock data is confined to `src/lib/mock/*.mock.ts` and always rendered with a
visible "MOCK DATA" badge — nothing in the UI passes off placeholder values
as a live signal.
