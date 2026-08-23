import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/novacore/EmptyState";
import { MarketOverviewChart } from "@/components/novacore/MarketOverviewChart";
import { NewsCard } from "@/components/novacore/NewsCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatFreshness } from "@/lib/format-freshness";
import { getMarketNews } from "@/novacore/market-news/adapters/get-market-news";
import { getMarketMovers } from "@/novacore/market-context/adapters/market-movers-adapter";
import { getCaShadowSnapshot } from "@/novacore/strategy-hub/adapters/ca-shadow-snapshot-adapter";

export default async function NovaCoreMarketPage() {
  const [movers, news, caShadow] = await Promise.all([getMarketMovers(), getMarketNews({ limit: 3 }), Promise.resolve(getCaShadowSnapshot())]);

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

      {/* §19 — optional C-A signal context on SPY, since C-A's market is SPY. Never presented as financial advice. */}
      <div className="mt-6">
        <Link href="/novacore/bots/CA_CANDIDATE_V1">
          <Card className="border-purple-400/20 transition-colors hover:border-purple-400/40">
            <CardHeader
              title="C-A signal context (SPY)"
              description="Contexto informativo del candidato C-A sobre SPY — no es una recomendación de inversión."
              action={<span className="rounded-full border border-purple-400/30 bg-purple-400/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-purple-400">SHADOW</span>}
            />
            <CardBody className="p-4">
              {caShadow.latestSignal ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] text-muted">Percentile rank</p>
                    <p className="font-mono text-sm text-foreground">{caShadow.latestSignal.percentileRank.toFixed(3)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Estado de señal</p>
                    <p className={`font-mono text-sm ${caShadow.latestSignal.triggered ? "text-buy" : "text-foreground"}`}>{caShadow.latestSignal.triggered ? "TRIGGERED" : "SIN DISPARO"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">Posición hipotética</p>
                    <p className="font-mono text-sm text-foreground">{caShadow.shadow.currentPosition}</p>
                  </div>
                </div>
              ) : (
                <EmptyState variant="noData" message="Sin señal SHADOW todavía." detail="C-A es un candidato SHADOW — sin órdenes reales, sin recomendación de inversión." />
              )}
            </CardBody>
          </Card>
        </Link>
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
