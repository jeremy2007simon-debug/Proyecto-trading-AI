/**
 * Block 8.3 — fetches INTRADAY candles for SPY/QQQ (Family 2, Intraday
 * Momentum — §4/§7 of the report restrict this family to the two most
 * liquid instruments, per the brief's own "Prioridad: SPY, QQQ"
 * instruction).
 *
 * Data-quality finding (documented, not hidden — see report §2):
 * Yahoo's chart endpoint hard-limits 5m/15m/30m bars to the last 60
 * CALENDAR days regardless of the requested range (HTTP 422 beyond
 * that). This script fetches 1h bars at 2 years (the longest interval
 * Yahoo serves beyond 60 days for a non-daily bar) as Family 2's
 * PRIMARY dataset, and separately fetches whatever 5m/15m/30m history
 * IS available (the last 60 days) as a clearly-labeled supplementary/
 * limited dataset — never presented as adequate for the same statistical
 * claims as the 1h series. Every bar is confirmed regular-session-only
 * (09:30-16:00 ET) by `tests/core/us-index-research/session-filter.test.ts`.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/us-index/fetch-us-index-intraday.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../../lib/sandbox-io";
setupSandboxIO();

export interface UsIndexIntradayBar {
  /** ISO-8601 UTC instant of the bar. */
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const OUTPUT_DIR = join(process.cwd(), "results", "block8-3", "datasets", "intraday");
const TICKERS = ["SPY", "QQQ"] as const;

interface YahooChartResponse {
  chart: {
    result?: [
      {
        meta: { dataGranularity: string };
        timestamp: number[];
        indicators: { quote: [{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }] };
      },
    ];
    error?: { code: string; description: string };
  };
}

async function fetchIntraday(ticker: string, interval: string, rangeDays: number): Promise<UsIndexIntradayBar[]> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - rangeDays * 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&period1=${period1}&period2=${period2}&includePrePost=false`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
  if (response.status !== 200) throw new Error(`Yahoo chart fetch failed for ${ticker} @ ${interval}: HTTP ${response.status}`);
  const raw = (await response.json()) as YahooChartResponse;
  const result = raw.chart.result?.[0];
  if (!result) throw new Error(`Yahoo chart returned no result for ${ticker} @ ${interval}: ${JSON.stringify(raw.chart.error)}`);

  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];
  const bars: UsIndexIntradayBar[] = [];
  for (let i = 0; i < timestamp.length; i++) {
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const close = quote.close[i];
    if (open === null || high === null || low === null || close === null) continue;
    bars.push({ timestamp: new Date(timestamp[i] * 1000).toISOString(), open, high, low, close, volume: quote.volume[i] ?? 0 });
  }
  return bars;
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const report: Record<string, Record<string, { bars: number; from: string; to: string }>> = {};

  for (const ticker of TICKERS) {
    report[ticker] = {};

    // PRIMARY dataset: 1h, ~2 years (Yahoo's own ceiling for this interval).
    console.log(`[Block 8.3] Fetching ${ticker} 1h (2y, PRIMARY) ...`);
    const hourly = await fetchIntraday(ticker, "60m", 729);
    writeFileSync(join(OUTPUT_DIR, `${ticker}_1h.json`), JSON.stringify(hourly));
    report[ticker]["1h"] = { bars: hourly.length, from: hourly[0]?.timestamp ?? "", to: hourly[hourly.length - 1]?.timestamp ?? "" };

    // SUPPLEMENTARY, explicitly limited datasets (60-day ceiling).
    for (const interval of ["5m", "15m", "30m"]) {
      console.log(`[Block 8.3] Fetching ${ticker} ${interval} (60d, SUPPLEMENTARY/LIMITED) ...`);
      const bars = await fetchIntraday(ticker, interval, 59);
      writeFileSync(join(OUTPUT_DIR, `${ticker}_${interval}.json`), JSON.stringify(bars));
      report[ticker][interval] = { bars: bars.length, from: bars[0]?.timestamp ?? "", to: bars[bars.length - 1]?.timestamp ?? "" };
    }
  }

  writeFileSync(join(OUTPUT_DIR, "_fetch-report.json"), JSON.stringify(report, null, 2));
  console.log("[Block 8.3] Done.");
  for (const [ticker, byInterval] of Object.entries(report)) {
    for (const [interval, r] of Object.entries(byInterval)) console.log(`  ${ticker} ${interval}: ${r.bars} bars (${r.from} -> ${r.to})`);
  }
}

main().catch((error) => {
  console.error("[Block 8.3] fetch-us-index-intraday failed:", error);
  process.exitCode = 1;
});
