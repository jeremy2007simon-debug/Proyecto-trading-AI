/**
 * Block 9.x (Strategy #2 deep backtest) — fetches all data the 5
 * pre-registered families need, per `docs/BLOCK9_STRATEGY2_PREREGISTRATION.md`:
 *
 *   - SPY/QQQ/IWM/DIA daily OHLC (Yahoo) — same universe, same provider,
 *     same fetch pattern as `scripts/research/us-index/fetch-us-index-daily.ts`
 *     (Block 8.3). Alpaca was already confirmed unusable for market data
 *     in this environment (Block 8.3's own data-audit) — not re-tried here.
 *   - VIX daily level (FRED `VIXCLS`, free/keyless) — family E.
 *   - SVXY daily OHLC (Yahoo) — family E's defined-risk short-vol-ETP path.
 *   - USMV, SPLV daily OHLC (Yahoo) — family F's listed-factor-ETF configs.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/strategy2/fetch-block9b-data.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../../lib/sandbox-io";
setupSandboxIO();

export interface DailyBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number; // raw/unadjusted
  adjClose: number; // dividend + split adjusted
  volume: number;
}

const OUTPUT_DIR = join(process.cwd(), "results", "block9b", "datasets");

const EQUITY_TICKERS = ["SPY", "QQQ", "IWM", "DIA", "SVXY", "USMV", "SPLV"] as const;

interface YahooChartResponse {
  chart: {
    result?: [
      {
        meta: { dataGranularity: string };
        timestamp: number[];
        indicators: {
          quote: [{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }];
          adjclose?: [{ adjclose: (number | null)[] }];
        };
        events?: { dividends?: Record<string, unknown>; splits?: Record<string, unknown> };
      },
    ];
    error?: { code: string; description: string };
  };
}

async function fetchDaily(ticker: string): Promise<{ bars: DailyBar[]; granularity: string }> {
  const period2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=0&period2=${period2}&events=div,split`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Accept: "application/json" } });
  if (response.status !== 200) throw new Error(`Yahoo chart fetch failed for ${ticker}: HTTP ${response.status}`);
  const raw = (await response.json()) as YahooChartResponse;
  const result = raw.chart.result?.[0];
  if (!result) throw new Error(`Yahoo chart returned no result for ${ticker}: ${JSON.stringify(raw.chart.error)}`);

  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];
  const adj = indicators.adjclose?.[0]?.adjclose;
  const bars: DailyBar[] = [];
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
  return { bars, granularity: result.meta.dataGranularity };
}

interface VixPoint {
  date: string;
  value: number;
}

async function fetchVixFromFred(): Promise<VixPoint[]> {
  const response = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS");
  if (response.status !== 200) throw new Error(`FRED VIXCLS fetch failed: HTTP ${response.status}`);
  const csv = await response.text();
  const lines = csv.trim().split("\n").slice(1); // drop header row
  const points: VixPoint[] = [];
  for (const line of lines) {
    const [date, valueRaw] = line.split(",");
    const value = Number(valueRaw);
    if (!date || !Number.isFinite(value)) continue; // FRED uses "." for missing (market holiday) observations
    points.push({ date, value });
  }
  return points;
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const report: Record<string, { bars: number; from: string; to: string; granularity?: string }> = {};

  for (const ticker of EQUITY_TICKERS) {
    console.log(`[Block 9.x] Fetching ${ticker} daily (full history) ...`);
    const { bars, granularity } = await fetchDaily(ticker);
    if (granularity !== "1d") throw new Error(`${ticker}: expected daily granularity, got "${granularity}" — refusing to write a mis-granularity dataset.`);
    writeFileSync(join(OUTPUT_DIR, `${ticker}_1d.json`), JSON.stringify(bars));
    report[ticker] = { bars: bars.length, from: bars[0]?.date ?? "", to: bars[bars.length - 1]?.date ?? "", granularity };
    // Be gentle with Yahoo's unofficial endpoint — Block 8.3 hit no rate-limit issues at this pace; a short pause avoids one here.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log("[Block 9.x] Fetching VIX (FRED VIXCLS) ...");
  const vix = await fetchVixFromFred();
  writeFileSync(join(OUTPUT_DIR, "VIX_daily.json"), JSON.stringify(vix));
  report.VIX = { bars: vix.length, from: vix[0]?.date ?? "", to: vix[vix.length - 1]?.date ?? "" };

  writeFileSync(join(OUTPUT_DIR, "_fetch-report.json"), JSON.stringify(report, null, 2));
  console.log("[Block 9.x] Done.");
  for (const [ticker, r] of Object.entries(report)) {
    console.log(`  ${ticker}: ${r.bars} bars (${r.from} -> ${r.to})`);
  }
}

main().catch((error) => {
  console.error("[Block 9.x] fetch-block9b-data failed:", error);
  process.exitCode = 1;
});
