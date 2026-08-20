"use client";

import { useEffect, useState } from "react";
import { LineChart } from "@/components/backtesting/LineChart";
import { formatFreshness } from "@/lib/format-freshness";
import type { ChartTimeframe, MarketBenchmarkSeries } from "@/novacore/market-context/types";

const TIMEFRAMES: ChartTimeframe[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];
const MARKETS: { market: "SP500" | "NASDAQ100" | "DOWJONES" | "RUSSELL2000"; ticker: string }[] = [
  { market: "SP500", ticker: "SPY" },
  { market: "NASDAQ100", ticker: "QQQ" },
  { market: "DOWJONES", ticker: "DIA" },
  { market: "RUSSELL2000", ticker: "IWM" },
];

/**
 * §4 — Market tab's main chart: a market switcher (RS3M's own four-index
 * universe) plus the same timeframe row as the Risk page's SPY chart.
 * Client component — fetches `/api/novacore/market/chart`, the only
 * place that talks to Alpaca; this component never holds a credential.
 */
export function MarketOverviewChart() {
  const [market, setMarket] = useState<(typeof MARKETS)[number]["market"]>("SP500");
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1M");
  const [series, setSeries] = useState<MarketBenchmarkSeries | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/novacore/market/chart?market=${market}&timeframe=${timeframe}`)
      .then((res) => res.json())
      .then((data: MarketBenchmarkSeries) => {
        if (!cancelled) setSeries(data);
      })
      .catch(() => {
        if (!cancelled)
          setSeries({
            available: false,
            unavailableReason: "Request failed.",
            timeframe,
            market,
            label: market,
            ticker: MARKETS.find((m) => m.market === market)?.ticker ?? market,
            points: [],
            provenance: "UNAVAILABLE",
            source: "Alpaca Market Data API (unavailable)",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [market, timeframe]);

  const loading = series === null || series.market !== market || series.timeframe !== timeframe;
  const positive = (series?.percentChange ?? 0) >= 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {MARKETS.map((m) => (
          <button
            key={m.market}
            onClick={() => setMarket(m.market)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              market === m.market ? "border-accent/40 bg-accent/10 text-accent" : "border-border-subtle text-muted hover:text-foreground"
            }`}
          >
            {m.ticker}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          {series?.available ? (
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-2xl font-semibold text-foreground">${series.lastValue?.toFixed(2)}</span>
              <span className={`font-mono text-sm ${positive ? "text-buy" : "text-sell"}`}>
                {positive ? "+" : ""}
                {series.absoluteChange?.toFixed(2)} ({positive ? "+" : ""}
                {series.percentChange?.toFixed(2)}%)
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted">{series?.label ?? "Cargando…"}</p>
          )}
          <p className="text-[11px] text-muted-foreground">{series ? `${series.label} — proxy ETF, no el índice` : "…"}</p>
        </div>
        <div className="flex gap-1 rounded-full border border-border-subtle p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${tf === timeframe ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"}`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted">Cargando…</div>
      ) : series?.available ? (
        <>
          <LineChart points={series.points.map((p, i) => ({ x: i, y: p.close }))} color={positive ? "var(--buy)" : "var(--sell)"} />
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
            <span>Actualizado {formatFreshness(series.lastTimestamp)}</span>
            <span>{series.source}</span>
          </div>
        </>
      ) : (
        <div className="flex h-[200px] flex-col items-center justify-center gap-1 text-center text-sm text-muted">
          <span>Gráfica no disponible</span>
          <span className="max-w-sm text-[11px] text-muted-foreground">{series?.unavailableReason ?? "Proveedor de datos de mercado no configurado."}</span>
        </div>
      )}
    </div>
  );
}
