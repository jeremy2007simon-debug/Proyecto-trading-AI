"use client";

import { useEffect, useState } from "react";
import { LineChart } from "@/components/backtesting/LineChart";
import type { ChartTimeframe, SpyBenchmarkSeries } from "@/novacore/market-context/types";

const TIMEFRAMES: ChartTimeframe[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

/**
 * Block 7 / Observability Upgrade — S&P 500 benchmark chart. Client
 * component (needs interactive timeframe switching); fetches from
 * `/api/novacore/market/spy`, which is the only place that talks to
 * Alpaca — this component never holds or sees any credential.
 * Explicitly labeled SPY throughout, never "S&P 500 index".
 */
export function SpyBenchmarkChart() {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1M");
  const [series, setSeries] = useState<SpyBenchmarkSeries | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/novacore/market/spy?timeframe=${timeframe}`)
      .then((res) => res.json())
      .then((data: SpyBenchmarkSeries) => {
        if (!cancelled) setSeries(data);
      })
      .catch(() => {
        if (!cancelled)
          setSeries({
            available: false,
            unavailableReason: "Request failed.",
            timeframe,
            market: "SP500",
            label: "S&P 500 (SPY)",
            ticker: "SPY",
            points: [],
            provenance: "UNAVAILABLE",
            source: "Alpaca Market Data API (unavailable)",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [timeframe]);

  const loading = series === null || series.timeframe !== timeframe;
  const positive = (series?.percentChange ?? 0) >= 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">SPY</p>
          <p className="text-[11px] text-muted-foreground">ETF proxy for the S&amp;P 500 index — not the index itself</p>
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
        <div className="flex h-[200px] items-center justify-center text-sm text-muted">Loading…</div>
      ) : series?.available ? (
        <>
          <div className="mb-2 flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-lg font-semibold text-foreground">${series.lastValue?.toFixed(2)}</span>
            <span className={`font-mono text-sm ${positive ? "text-buy" : "text-sell"}`}>
              {positive ? "+" : ""}
              {series.absoluteChange?.toFixed(2)} ({positive ? "+" : ""}
              {series.percentChange?.toFixed(2)}%)
            </span>
          </div>
          <LineChart points={series.points.map((p, i) => ({ x: i, y: p.close }))} color={positive ? "var(--buy)" : "var(--sell)"} />
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
            <span>As of {series.lastTimestamp ? new Date(series.lastTimestamp).toLocaleString() : "—"}</span>
            <span>{series.source}</span>
          </div>
        </>
      ) : (
        <div className="flex h-[200px] flex-col items-center justify-center gap-1 text-center text-sm text-muted">
          <span>SPY chart unavailable</span>
          <span className="max-w-sm text-[11px] text-muted-foreground">{series?.unavailableReason ?? "Market data provider not configured."}</span>
        </div>
      )}
    </div>
  );
}
