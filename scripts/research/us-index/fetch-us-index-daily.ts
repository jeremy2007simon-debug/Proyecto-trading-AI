/**
 * Block 8.3 (US Index Top-5 Deep Research) — fetches DAILY candles for
 * the frozen 4-instrument universe (SPY, QQQ, IWM, DIA — see §4 of
 * docs/BLOCK8_3_US_INDEX_TOP5_DEEP_RESEARCH_REPORT.md) at the maximum
 * reliable history each ticker offers.
 *
 * Provider: Yahoo Finance's unofficial `chart` endpoint. Alpaca Market
 * Data API was tried FIRST, per this round's explicit priority — see
 * the data-audit section of the report: `ALPACA_API_KEY_ID`/
 * `ALPACA_API_SECRET_KEY` are unset in this environment, and the only
 * Alpaca credentials present (`ALPACA_PAPER_API_KEY_ID`/
 * `ALPACA_PAPER_API_SECRET_KEY`, Block 6's PAPER trading keys) were
 * tested read-only against both `data.alpaca.markets` and
 * `paper-api.alpaca.markets` and returned 401 Unauthorized from both —
 * confirmed NOT usable for market data in this environment. Yahoo is
 * the same fallback provider Block 8/8.2 used for FX, applied here to
 * equities with the SAME documented caveats (indicative price series,
 * no true observed bid/ask).
 *
 * IMPORTANT gotcha found and worked around here (documented, not
 * hidden): requesting `interval=1d&range=max` silently returns MONTHLY
 * bars for a long-lived ticker (Yahoo appears to auto-downsample when
 * the implied bar count would be very large) — `meta.dataGranularity`
 * confirms `"1mo"` even though `interval=1d` was requested. Using an
 * explicit `period1=0` (Unix epoch) / `period2=<now>` range instead
 * returns genuine daily granularity for the full listed history. Every
 * fetch in this script uses explicit period1/period2, never `range=max`,
 * specifically because of this.
 *
 * Fetches BOTH `close` (raw/unadjusted) and Yahoo's `adjclose` (dividend-
 * AND split-adjusted) so the adjustment test (`tests/core/us-index-
 * research/data-adjustment.test.ts`) can prove the two series genuinely
 * differ around a real ex-dividend date — the exact class of bug (silent
 * unadjusted prices) this round is required to specifically guard against.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/us-index/fetch-us-index-daily.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../../lib/sandbox-io";
setupSandboxIO();

export interface UsIndexDailyBar {
  date: string; // YYYY-MM-DD (Eastern trading date, per Yahoo's own bar labeling)
  open: number;
  high: number;
  low: number;
  close: number; // raw/unadjusted
  adjClose: number; // dividend + split adjusted
  volume: number;
}

const OUTPUT_DIR = join(process.cwd(), "results", "block8-3", "datasets", "daily");

/** Frozen universe (§4 of the report) — SPY/QQQ/IWM/DIA only. No sector ETFs: none of the 5 families needs sector diversification, decided BEFORE any fetch. */
const TICKERS = ["SPY", "QQQ", "IWM", "DIA"] as const;

interface YahooChartResponse {
  chart: {
    result?: [
      {
        meta: { dataGranularity: string; exchangeTimezoneName: string; gmtoffset: number };
        timestamp: number[];
        indicators: {
          quote: [{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }];
          adjclose?: [{ adjclose: (number | null)[] }];
        };
        events?: { dividends?: Record<string, { amount: number; date: number }>; splits?: Record<string, { numerator: number; denominator: number; date: number }> };
      },
    ];
    error?: { code: string; description: string };
  };
}

async function fetchDaily(ticker: string): Promise<{ bars: UsIndexDailyBar[]; dividends: number; splits: number; granularity: string }> {
  const period2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=0&period2=${period2}&events=div,split`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
  if (response.status !== 200) throw new Error(`Yahoo chart fetch failed for ${ticker}: HTTP ${response.status}`);
  const raw = (await response.json()) as YahooChartResponse;
  const result = raw.chart.result?.[0];
  if (!result) throw new Error(`Yahoo chart returned no result for ${ticker}: ${JSON.stringify(raw.chart.error)}`);

  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];
  const adj = indicators.adjclose?.[0]?.adjclose;
  const bars: UsIndexDailyBar[] = [];
  for (let i = 0; i < timestamp.length; i++) {
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const close = quote.close[i];
    const volume = quote.volume[i];
    const adjClose = adj?.[i];
    if (open === null || high === null || low === null || close === null || adjClose == null) continue;
    const date = new Date(timestamp[i] * 1000).toISOString().slice(0, 10);
    bars.push({ date, open, high, low, close, adjClose, volume: volume ?? 0 });
  }

  return {
    bars,
    dividends: Object.keys(result.events?.dividends ?? {}).length,
    splits: Object.keys(result.events?.splits ?? {}).length,
    granularity: result.meta.dataGranularity,
  };
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const report: Record<string, { bars: number; from: string; to: string; dividends: number; splits: number; granularity: string }> = {};

  for (const ticker of TICKERS) {
    console.log(`[Block 8.3] Fetching ${ticker} daily (full history) ...`);
    const { bars, dividends, splits, granularity } = await fetchDaily(ticker);
    if (granularity !== "1d") throw new Error(`${ticker}: expected daily granularity, got "${granularity}" — refusing to write a mis-granularity dataset.`);
    writeFileSync(join(OUTPUT_DIR, `${ticker}_1d.json`), JSON.stringify(bars));
    report[ticker] = { bars: bars.length, from: bars[0]?.date ?? "", to: bars[bars.length - 1]?.date ?? "", dividends, splits, granularity };
  }

  writeFileSync(join(OUTPUT_DIR, "_fetch-report.json"), JSON.stringify(report, null, 2));
  console.log("[Block 8.3] Done.");
  for (const [ticker, r] of Object.entries(report)) {
    console.log(`  ${ticker}: ${r.bars} bars (${r.from} -> ${r.to}), ${r.dividends} dividend events, ${r.splits} split events, granularity=${r.granularity}`);
  }
}

main().catch((error) => {
  console.error("[Block 8.3] fetch-us-index-daily failed:", error);
  process.exitCode = 1;
});
