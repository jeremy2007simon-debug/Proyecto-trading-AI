import { ExternalLink } from "lucide-react";
import { formatFreshness } from "@/lib/format-freshness";
import { NEWS_CATEGORY_LABEL } from "@/lib/market-news-labels";
import type { MarketNewsItem } from "@/novacore/market-news/types";

/**
 * §8 — one news item. Never renders more than headline + source +
 * category + relevance + a short summary/snippet (when the provider's
 * response included one) — see `docs/MARKET_NEWS_PROVIDERS.md` "What is
 * never stored or shown". Tapping opens the original source; NovaCore
 * never reproduces a full article body.
 */
export function NewsCard({ item, size = "compact" }: { item: MarketNewsItem; size?: "compact" | "large" }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-border-subtle bg-surface-raised p-4 transition-colors hover:border-border"
    >
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-full border border-border-subtle px-2 py-0.5">{NEWS_CATEGORY_LABEL[item.category]}</span>
        <span>{item.source}</span>
        <span>·</span>
        <span>{formatFreshness(item.publishedAt)}</span>
      </div>

      <p className={`mt-1.5 font-medium text-foreground ${size === "large" ? "text-base" : "text-sm"}`}>{item.headline}</p>

      {item.summary ? <p className="mt-1 line-clamp-2 text-xs text-muted">{item.summary}</p> : null}

      {item.whyItMatters ? (
        <p className="mt-2 rounded-lg bg-accent/5 px-2.5 py-1.5 text-[11px] text-accent">
          <span className="font-semibold">Por qué importa: </span>
          {item.whyItMatters}
        </p>
      ) : null}

      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <ExternalLink className="size-3" strokeWidth={2} />
        Ver fuente original
      </div>
    </a>
  );
}
