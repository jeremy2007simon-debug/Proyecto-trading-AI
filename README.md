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
cp .env.example .env.local   # fill in your Supabase + Alpaca credentials
npm run dev
```

Real market data requires a free [Alpaca](https://alpaca.markets) account
(Market Data API only — no funding or trading permissions needed). See
`docs/ARCHITECTURE.md` §7 for why Alpaca was chosen and how the instrument
(SPY, as a proxy for the S&P 500) is configured. Without
`ALPACA_API_KEY_ID`/`ALPACA_API_SECRET_KEY` set, the Dashboard, Market, and
Market Regime pages show a "Data unavailable" notice rather than fabricated
data.

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

Apply the migrations in `supabase/migrations/` **in order** to a Supabase
project (SQL editor, or `supabase db push` if you have the CLI linked):

- `0001_init_schema.sql` — core tables (`markets`, `market_candles`,
  `market_regimes`, `strategies`, `strategy_signals`, `consensus_signals`,
  `final_signals`, `paper_trades`, `backtest_runs`, `risk_events`,
  `system_logs`, ...) with Row Level Security enabled.
- `0002_market_candles_provider_identity.sql` — adds `symbol`/`provider` to
  `market_candles` so multiple data providers can never collide.

## Project structure

```
src/
  app/(dashboard)/       Dashboard pages (Market, Market Regime, Strategies, Signals, ...)
  app/api/                Internal API routes: market-data, market-data/ingest,
                          indicators, market-regime, data-quality, webhooks/tradingview
  components/            UI, layout, and domain-specific presentational components
  core/                   Domain modules — one folder per module (market-data, market-hours,
                          indicators, data-quality, market-regime, risk-engine, ...)
  lib/                    Supabase clients, data repositories, security/validation
                          helpers, navigation config, remaining mock data
supabase/migrations/       SQL schema
docs/ARCHITECTURE.md        Full architecture write-up
```

Any remaining mock data is confined to `src/lib/mock/*.mock.ts` and always
rendered with a visible "MOCK DATA" badge — nothing in the UI passes off
placeholder values as a live signal. Where a real implementation exists
(Market Data, Indicators, Market Regime), the dashboard shows real data or an
explicit "Data unavailable" notice — never mock data as a fallback.
