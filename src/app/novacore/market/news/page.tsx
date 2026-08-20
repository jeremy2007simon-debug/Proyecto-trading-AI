import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/novacore/EmptyState";
import { NewsCard } from "@/components/novacore/NewsCard";
import { formatFreshness } from "@/lib/format-freshness";
import { getMarketNews } from "@/novacore/market-news/adapters/get-market-news";
import type { MarketNewsCategory, MarketNewsItem } from "@/novacore/market-news/types";

type FilterKey = "ALL" | "SP500" | "NASDAQ" | "DOW" | "RUSSELL" | "FED" | "MACRO" | "EARNINGS";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "Todo" },
  { key: "SP500", label: "S&P 500" },
  { key: "NASDAQ", label: "Nasdaq" },
  { key: "DOW", label: "Dow" },
  { key: "RUSSELL", label: "Russell" },
  { key: "FED", label: "FED" },
  { key: "MACRO", label: "Macro" },
  { key: "EARNINGS", label: "Resultados" },
];

const MACRO_CATEGORIES: MarketNewsCategory[] = ["INFLATION", "GDP", "EMPLOYMENT", "TREASURY_YIELDS", "GEOPOLITICS", "TRADE_TARIFFS"];

function matchesFilter(item: MarketNewsItem, filter: FilterKey): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "SP500":
      return item.relatedMarkets.includes("SP500");
    case "NASDAQ":
      return item.relatedMarkets.includes("NASDAQ100");
    case "DOW":
      return item.relatedMarkets.includes("DOWJONES");
    case "RUSSELL":
      return item.relatedMarkets.includes("RUSSELL2000");
    case "FED":
      return item.category === "FED_RATES";
    case "MACRO":
      return MACRO_CATEGORIES.includes(item.category);
    case "EARNINGS":
      return item.category === "EARNINGS";
  }
}

const TOP_STORY_THRESHOLD = 70;
const TOP_STORY_MAX = 3;

export default async function NovaCoreMarketNewsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter: rawFilter } = await searchParams;
  const filter: FilterKey = FILTERS.some((f) => f.key === rawFilter) ? (rawFilter as FilterKey) : "ALL";

  const news = await getMarketNews({ limit: 50 });
  const filtered = news.available ? news.items.filter((item) => matchesFilter(item, filter)) : [];
  const topStories = filtered.filter((item) => item.relevanceScore >= TOP_STORY_THRESHOLD).slice(0, TOP_STORY_MAX);
  const latest = filtered.filter((item) => !topStories.includes(item));

  return (
    <div>
      <PageHeader title="Market News" description="Solo observabilidad — nunca genera órdenes ni cambia RS3M. No es un feed indiscriminado: solo lo relevante para el universo RS3M." />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "ALL" ? "/novacore/market/news" : `/novacore/market/news?filter=${f.key}`}
            className={`rounded-full border px-3 py-1 text-xs ${filter === f.key ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {!news.available ? (
        <EmptyState variant="notConnected" message="Market News no está conectado en este entorno." detail={news.unavailableReason} />
      ) : filtered.length === 0 ? (
        <EmptyState variant="noData" message="No hay noticias para este filtro ahora mismo." />
      ) : (
        <div className="space-y-6">
          {topStories.length > 0 ? (
            <section>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Top Stories</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {topStories.map((item) => (
                  <NewsCard key={item.id} item={item} size="large" />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Latest</p>
            <div className="space-y-3">
              {latest.map((item) => (
                <NewsCard key={item.id} item={item} />
              ))}
            </div>
          </section>

          <p className="text-[11px] text-muted-foreground">Actualizado {formatFreshness(news.asOf)} · {news.source}</p>
        </div>
      )}
    </div>
  );
}
