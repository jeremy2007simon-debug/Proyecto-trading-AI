import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/novacore/EmptyState";
import { MarketOverviewChart } from "@/components/novacore/MarketOverviewChart";
import { NewsCard } from "@/components/novacore/NewsCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatFreshness } from "@/lib/format-freshness";
import { getMarketNews } from "@/novacore/market-news/adapters/get-market-news";
import { getMarketMovers } from "@/novacore/market-context/adapters/market-movers-adapter";

export default async function NovaCoreMarketPage() {
  const [movers, news] = await Promise.all([getMarketMovers(), getMarketNews({ limit: 3 })]);

  return (
    <div>
      <PageHeader title="Mercado" description="S&P 500 y el resto del universo RS3M (Nasdaq 100, Dow Jones, Russell 2000). Nunca confundir el índice con su ETF proxy." />

      <Card>
        <CardBody className="p-4">
          <MarketOverviewChart />
        </CardBody>
      </Card>

      <div className="mt-6">
        <Card>
          <CardHeader title="Market performance" description="Variación del día por mercado — mismo cálculo que la gráfica 1D de cada uno." />
          <CardBody className="divide-y divide-border-subtle p-0">
            {movers.map((m) => (
              <div key={m.market} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{m.label}</p>
                  <p className="text-[11px] text-muted-foreground">{m.ticker}</p>
                </div>
                {m.available && m.percentChange !== undefined ? (
                  <div className="text-right">
                    <p className="font-mono text-sm text-foreground">${m.lastValue?.toFixed(2)}</p>
                    <p className={`font-mono text-xs ${m.percentChange >= 0 ? "text-buy" : "text-sell"}`}>
                      {m.percentChange >= 0 ? "+" : ""}
                      {m.percentChange.toFixed(2)}%
                    </p>
                  </div>
                ) : (
                  <span className="text-xs text-muted">No disponible</span>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader title="Market News" description="Noticias relevantes para el universo RS3M." action={<Link href="/novacore/market/news" className="text-xs text-accent hover:underline">Ver todas →</Link>} />
          <CardBody className="p-4">
            {news.available && news.items.length > 0 ? (
              <div className="space-y-3">
                {news.items.map((item) => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <EmptyState variant="notConnected" message="Market News no está conectado en este entorno." detail={news.unavailableReason} />
            )}
            {news.available ? <p className="mt-3 text-[11px] text-muted-foreground">Actualizado {formatFreshness(news.asOf)} · {news.source}</p> : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
