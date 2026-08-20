# NovaCore Market News — provider options

Observability only. See `docs/BLOCK7_NOVACORE_TRADING_LAB.md` — Market
News can never generate an order, change RS3M's parameters, approve a
rebalance, bypass a guard, or otherwise touch the execution path. This
document exists to satisfy the Mobile UX + Market News addendum's
requirement to document provider options rather than invent credentials.

## Abstraction

`src/novacore/market-news/provider.ts` defines `MarketNewsProvider`, a
one-method interface (`fetchRecent`). Nothing else in the codebase talks
to a news API directly — every consumer goes through
`getMarketNews()` (`src/novacore/market-news/adapters/get-market-news.ts`),
which asks `provider-factory.ts` for whichever provider is configured.
Adding a second provider means implementing the interface once and
changing what the factory returns; no other file changes.

## Default: Alpaca News API

`src/novacore/market-news/providers/alpaca-news-provider.ts` implements
the interface against Alpaca's News API
(`https://data.alpaca.markets/v1beta1/news`, same base host as the
existing Market Data API). It is the default/recommended provider for
one reason: it reuses the credentials already required for the
SPY/QQQ/DIA/IWM benchmark charts (`ALPACA_API_KEY_ID` /
`ALPACA_API_SECRET_KEY`, see `.env.example`) — enabling real market news
requires **zero new secrets**, not a new account or a new credential
domain.

In this environment those credentials are unset, so
`createMarketNewsProvider()` correctly returns `PROVIDER_UNAVAILABLE` and
`getMarketNews()` returns `{ available: false, ... }` — the News UI shows
an honest "not connected" state, never fabricated headlines.

## Alternatives considered (not implemented)

If Alpaca News API coverage or terms ever stop fitting NovaCore's needs,
these are reasonable next options — each would need its own
`MarketNewsProvider` implementation and its own credential(s), added the
same way `alpaca-news-provider.ts` was:

- **Finnhub** (`/news`, `/company-news`) — generous free tier, has a
  dedicated market-news endpoint with category tagging.
- **Marketaux** — purpose-built for financial-news aggregation with
  entity/sentiment tagging out of the box.
- **NewsAPI.org** — broad general-news coverage; would need this
  codebase's own `relevance.ts` classifier more heavily since it has no
  financial-specific categorization.

None of these are wired up. Do not add a `NEWS_API_KEY`-style variable
speculatively — add the variable in the same commit that adds the
provider implementation and switches the factory, so an unused secret
never sits in `.env.example` unexplained.

## What is never stored or shown

Per the addendum's licensing constraint, only fields explicitly permitted
by an API's terms are ever persisted or rendered: headline, source,
`publishedAt`, a short summary/snippet (when the provider's response
includes one), URL, derived category, derived related markets/symbols,
and a deterministically-computed relevance score. Full article bodies are
never fetched, stored, or displayed — only Alpaca's own `summary` field,
and `include_content=false` is passed explicitly on every request.
