import type { Result } from "@/core/shared/types";
import type { MarketNewsProvider, MarketNewsProviderError, RawMarketNewsItem } from "@/novacore/market-news/provider";

/**
 * Alpaca News API (https://docs.alpaca.markets/reference/news-3) adapter
 * — chosen as the default/recommended provider specifically because it
 * reuses the SAME credential domain already configured for the SPY/QQQ/
 * DIA/IWM benchmark charts (`ALPACA_API_KEY_ID`/`ALPACA_API_SECRET_KEY`,
 * Market Data API), so wiring up real market news requires exactly zero
 * new secrets. Same request shape and auth headers as
 * `src/core/market-data/providers/alpaca.adapter.ts` (`APCA-API-KEY-ID`
 * / `APCA-API-SECRET-KEY`) — deliberately kept simple (single attempt,
 * no retry ladder) since news is an observability feature, not a
 * trading-critical data path. See `docs/MARKET_NEWS_PROVIDERS.md` for
 * alternatives and how to switch.
 */

const ALPACA_NEWS_BASE_URL = "https://data.alpaca.markets/v1beta1/news";
const UNIVERSE_SYMBOLS = "SPY,QQQ,DIA,IWM";

interface AlpacaNewsArticle {
  id: number;
  headline: string;
  author?: string;
  created_at: string;
  updated_at?: string;
  summary?: string;
  url: string;
  symbols?: string[];
  source?: string;
}

interface AlpacaNewsResponse {
  news: AlpacaNewsArticle[] | null;
  next_page_token: string | null;
}

export interface AlpacaNewsCredentials {
  keyId: string;
  secretKey: string;
}

export function createAlpacaNewsProvider(credentials: AlpacaNewsCredentials): MarketNewsProvider {
  return {
    id: "alpaca-news",

    async fetchRecent({ limit }): Promise<Result<RawMarketNewsItem[], MarketNewsProviderError>> {
      const url = new URL(ALPACA_NEWS_BASE_URL);
      url.searchParams.set("symbols", UNIVERSE_SYMBOLS);
      url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 50)));
      url.searchParams.set("include_content", "false");

      let response: Response;
      try {
        response = await fetch(url.toString(), {
          headers: {
            "APCA-API-KEY-ID": credentials.keyId,
            "APCA-API-SECRET-KEY": credentials.secretKey,
            Accept: "application/json",
          },
        });
      } catch (err) {
        return {
          ok: false,
          error: { code: "PROVIDER_UNAVAILABLE", message: `Network error calling Alpaca News API: ${err instanceof Error ? err.message : String(err)}` },
        };
      }

      if (response.status === 429) {
        return { ok: false, error: { code: "RATE_LIMITED", message: "Alpaca News API rate limit exceeded (429)." } };
      }
      if (!response.ok) {
        return {
          ok: false,
          error: { code: response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "UNKNOWN", message: `Alpaca News API returned ${response.status}.` },
        };
      }

      const body = (await response.json()) as AlpacaNewsResponse;
      const articles = body.news ?? [];
      if (articles.length === 0) {
        return { ok: false, error: { code: "NO_DATA", message: "Alpaca News API returned zero articles for the RS3M universe symbols." } };
      }

      return {
        ok: true,
        value: articles.map((a) => ({
          id: String(a.id),
          headline: a.headline,
          source: a.source && a.source.length > 0 ? a.source : "Alpaca News",
          publishedAt: a.created_at,
          url: a.url,
          summary: a.summary && a.summary.length > 0 ? a.summary : undefined,
          symbols: a.symbols ?? [],
        })),
      };
    },
  };
}
