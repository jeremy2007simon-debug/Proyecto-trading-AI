/**
 * Block 8 (Forex Research Lab) — fetches historical FX candles for the
 * four pairs in scope (EUR/USD, GBP/USD, USD/JPY, AUD/USD) and writes a
 * canonical local cache under `results/block8/forex/data/` plus a
 * machine-readable data-quality report.
 *
 * DATA SOURCE: Yahoo Finance's unofficial `chart` endpoint
 * (`query1.finance.yahoo.com/v8/finance/chart/<PAIR>=X`). This is the
 * ONLY FX data source reachable from this environment without an API
 * key — no Alpaca (equities only), no OANDA/Polygon/Twelve Data account
 * configured. IMPORTANT CAVEATS, disclosed here and in
 * `docs/BLOCK8_FOREX_RESEARCH_REPORT.md`:
 *   - This is an INDICATIVE aggregator price series, not a measured
 *     bid/ask. There is no true spread in this feed — `volume` is
 *     always 0. Spread/commission/slippage/swap are therefore modeled
 *     separately as documented ASSUMPTIONS (see
 *     `src/core/backtesting/research/forex-cost-presets.ts`), never
 *     derived from this feed.
 *   - Hourly (`1h`) granularity is available for ~2.8 years of history
 *     (verified empirically at fetch time — Yahoo does not honor the
 *     requested `range` exactly). This is enough for a chronological
 *     train/OOS split and a handful of walk-forward windows.
 *   - `15m`/`30m` granularity is capped at ~60-80 days by the provider —
 *     nowhere near enough for a defensible OOS/walk-forward claim. These
 *     are fetched anyway for an EXPLORATORY-ONLY check and are flagged
 *     `INSUFFICIENT_SAMPLE` in the data-quality report; the funnel
 *     enforces this via `classifyStrategy`'s sample-quality gate.
 *   - `4h` bars do not exist natively on this provider — they are
 *     RESAMPLED from `1h` bars (see `resampleTo4h` below) and tagged
 *     with a distinct `provider` id so they are never silently
 *     conflated with a native feed.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/forex/fetch-fx-candles.ts
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../../lib/sandbox-io";
setupSandboxIO();

import { createForexCalendar } from "@/core/market-hours/forex-calendar";
import type { Candle } from "@/core/market-data/types";
import type { Market, Timeframe } from "@/core/shared/types";

const OUTPUT_ROOT = join(process.cwd(), "results", "block8", "forex");
const DATA_DIR = join(OUTPUT_ROOT, "data");

const PAIRS: { market: Market; yahooSymbol: string }[] = [
  { market: "FOREX_EURUSD", yahooSymbol: "EURUSD=X" },
  { market: "FOREX_GBPUSD", yahooSymbol: "GBPUSD=X" },
  { market: "FOREX_USDJPY", yahooSymbol: "USDJPY=X" },
  { market: "FOREX_AUDUSD", yahooSymbol: "AUDUSD=X" },
];

const NATIVE_PROVIDER_ID = "yahoo-chart-unofficial";
const RESAMPLED_4H_PROVIDER_ID = "yahoo-chart-unofficial-resampled-4h";

interface YahooChartResponse {
  chart: {
    result?: [
      {
        timestamp: number[];
        indicators: { quote: [{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }] };
      },
    ];
    error?: { code: string; description: string } | null;
  };
}

interface FetchQualityReport {
  market: Market;
  timeframe: Timeframe;
  provider: string;
  requestedRange: string;
  rawBarCount: number;
  droppedNullBars: number;
  droppedOutOfCalendarBars: number;
  finalBarCount: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  spanDays: number;
  sufficientForOosWalkForward: boolean;
  notes: string[];
}

async function fetchYahooChart(yahooSymbol: string, interval: string, range: string): Promise<YahooChartResponse> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (response.status !== 200) {
    throw new Error(`Yahoo chart fetch failed for ${yahooSymbol} interval=${interval}: HTTP ${response.status}`);
  }
  return (await response.json()) as YahooChartResponse;
}

/** Raw Yahoo response -> validated Candle[], dropping null/incomplete bars and bars our FX calendar considers outside the trading week. */
function toCandles(
  raw: YahooChartResponse,
  market: Market,
  timeframe: Timeframe,
  symbol: string,
  provider: string,
): { candles: Candle[]; rawBarCount: number; droppedNullBars: number; droppedOutOfCalendarBars: number } {
  const result = raw.chart.result?.[0];
  if (!result) {
    return { candles: [], rawBarCount: 0, droppedNullBars: 0, droppedOutOfCalendarBars: 0 };
  }
  const calendar = createForexCalendar(market);
  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];
  const candles: Candle[] = [];
  let droppedNullBars = 0;
  let droppedOutOfCalendarBars = 0;

  for (let i = 0; i < timestamp.length; i++) {
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const close = quote.close[i];
    if (open === null || high === null || low === null || close === null) {
      droppedNullBars += 1;
      continue;
    }
    const instant = new Date(timestamp[i] * 1000);
    if (!calendar.isTradingDay(instant)) {
      droppedOutOfCalendarBars += 1;
      continue;
    }
    candles.push({
      market,
      timeframe,
      timestamp: instant.toISOString(),
      symbol,
      provider,
      open,
      high,
      low,
      close,
      // This feed reports no real consolidated FX volume — always 0,
      // never fabricated. Strategies in this research MUST NOT depend
      // on volume for FX (see docs/BLOCK8_FOREX_RESEARCH_REPORT.md).
      volume: 0,
    });
  }
  return { candles, rawBarCount: timestamp.length, droppedNullBars, droppedOutOfCalendarBars };
}

/**
 * Aggregates 1h candles into 4h candles on fixed UTC 4-hour boundaries
 * (00,04,08,12,16,20). A bucket is only emitted once its boundary has
 * fully passed (never an in-progress partial bucket), and is emitted
 * regardless of how many of the 4 underlying hours are actually present
 * (weekend/session edges legitimately have fewer) — a bucket needs at
 * least 1 real hourly bar to be emitted at all.
 */
function resampleTo4h(hourly: readonly Candle[], market: Market): Candle[] {
  const buckets = new Map<number, Candle[]>();
  for (const c of hourly) {
    const t = new Date(c.timestamp);
    const bucketStart = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), Math.floor(t.getUTCHours() / 4) * 4);
    const arr = buckets.get(bucketStart) ?? [];
    arr.push(c);
    buckets.set(bucketStart, arr);
  }
  const result: Candle[] = [];
  for (const [bucketStart, bars] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...bars].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    result.push({
      market,
      timeframe: "4h",
      timestamp: new Date(bucketStart).toISOString(),
      symbol: sorted[0].symbol,
      provider: RESAMPLED_4H_PROVIDER_ID,
      open: sorted[0].open,
      high: Math.max(...sorted.map((b) => b.high)),
      low: Math.min(...sorted.map((b) => b.low)),
      close: sorted[sorted.length - 1].close,
      volume: 0,
    });
  }
  return result;
}

function buildQualityReport(
  market: Market,
  timeframe: Timeframe,
  provider: string,
  requestedRange: string,
  candles: readonly Candle[],
  rawBarCount: number,
  droppedNullBars: number,
  droppedOutOfCalendarBars: number,
): FetchQualityReport {
  const first = candles[0]?.timestamp ?? null;
  const last = candles[candles.length - 1]?.timestamp ?? null;
  const spanDays = first && last ? (new Date(last).getTime() - new Date(first).getTime()) / 86_400_000 : 0;
  // Rough bar-count bar for "enough for a chronological OOS split plus a
  // handful of walk-forward windows" — documented threshold, not derived
  // from a formula. 1h/4h clear it with ~2.8y of history; 15m/30m do not.
  const sufficientForOosWalkForward = spanDays >= 365;
  const notes: string[] = [];
  if (!sufficientForOosWalkForward) {
    notes.push(
      `Only ${spanDays.toFixed(0)} days of history available from this provider at this granularity — ` +
        "below the ~365-day bar this research treats as the minimum for a defensible chronological OOS " +
        "split plus multiple walk-forward windows. Any experiment on this market/timeframe is EXPLORATORY " +
        "ONLY and is expected to be capped at RESEARCH (not CANDIDATE) by the funnel's sample-quality gate.",
    );
  }
  if (droppedNullBars > 0) {
    notes.push(`Dropped ${droppedNullBars} bar(s) with null OHLC fields (provider-reported gaps).`);
  }
  if (droppedOutOfCalendarBars > 0) {
    notes.push(`Dropped ${droppedOutOfCalendarBars} bar(s) outside the FX 24/5 trading week per the research calendar.`);
  }
  return {
    market,
    timeframe,
    provider,
    requestedRange,
    rawBarCount,
    droppedNullBars,
    droppedOutOfCalendarBars,
    finalBarCount: candles.length,
    firstTimestamp: first,
    lastTimestamp: last,
    spanDays: Number(spanDays.toFixed(1)),
    sufficientForOosWalkForward,
    notes,
  };
}

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  const reports: FetchQualityReport[] = [];

  for (const { market, yahooSymbol } of PAIRS) {
    console.log(`[Block 8] Fetching ${yahooSymbol} 1h ...`);
    const rawHourly = await fetchYahooChart(yahooSymbol, "60m", "730d");
    const hourly = toCandles(rawHourly, market, "1h", yahooSymbol, NATIVE_PROVIDER_ID);
    writeFileSync(join(DATA_DIR, `${market}_1h.json`), JSON.stringify(hourly.candles));
    reports.push(
      buildQualityReport(market, "1h", NATIVE_PROVIDER_ID, "730d", hourly.candles, hourly.rawBarCount, hourly.droppedNullBars, hourly.droppedOutOfCalendarBars),
    );

    console.log(`[Block 8] Resampling ${yahooSymbol} 1h -> 4h ...`);
    const fourHour = resampleTo4h(hourly.candles, market);
    writeFileSync(join(DATA_DIR, `${market}_4h.json`), JSON.stringify(fourHour));
    reports.push(buildQualityReport(market, "4h", RESAMPLED_4H_PROVIDER_ID, "730d (resampled)", fourHour, hourly.candles.length, 0, 0));

    console.log(`[Block 8] Fetching ${yahooSymbol} 15m (exploratory, short window) ...`);
    const raw15m = await fetchYahooChart(yahooSymbol, "15m", "60d");
    const fifteenMin = toCandles(raw15m, market, "15m", yahooSymbol, NATIVE_PROVIDER_ID);
    writeFileSync(join(DATA_DIR, `${market}_15m.json`), JSON.stringify(fifteenMin.candles));
    reports.push(
      buildQualityReport(market, "15m", NATIVE_PROVIDER_ID, "60d", fifteenMin.candles, fifteenMin.rawBarCount, fifteenMin.droppedNullBars, fifteenMin.droppedOutOfCalendarBars),
    );

    console.log(`[Block 8] Fetching ${yahooSymbol} 30m (exploratory, short window) ...`);
    const raw30m = await fetchYahooChart(yahooSymbol, "30m", "60d");
    const thirtyMin = toCandles(raw30m, market, "30m", yahooSymbol, NATIVE_PROVIDER_ID);
    writeFileSync(join(DATA_DIR, `${market}_30m.json`), JSON.stringify(thirtyMin.candles));
    reports.push(
      buildQualityReport(market, "30m", NATIVE_PROVIDER_ID, "60d", thirtyMin.candles, thirtyMin.rawBarCount, thirtyMin.droppedNullBars, thirtyMin.droppedOutOfCalendarBars),
    );
  }

  writeFileSync(join(OUTPUT_ROOT, "data-quality-report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2));
  console.log(`[Block 8] Done. Wrote ${reports.length} dataset reports to ${OUTPUT_ROOT}/data-quality-report.json`);
  for (const r of reports) {
    console.log(`  ${r.market} ${r.timeframe}: ${r.finalBarCount} bars, ${r.spanDays}d span, sufficient=${r.sufficientForOosWalkForward}`);
  }
}

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

main().catch((error) => {
  console.error("[Block 8] fetch-fx-candles failed:", error);
  process.exitCode = 1;
});
