/**
 * Block 8.2 (FX Top-5 Deep Research) — fetches 15 years of DAILY FX
 * candles for the frozen 11-instrument universe (§5 of
 * docs/BLOCK8_2_FX_TOP5_DEEP_RESEARCH_REPORT.md): 7 majors + 4 crosses
 * needed for the cross-sectional/portfolio families. Same provider as
 * Block 8 (Yahoo's unofficial chart endpoint) — the only FX price
 * source reachable from this environment without a paid API key
 * (§3.1-3.2 of the report; Dukascopy bid/ask was re-tested for this
 * round and confirmed still unreachable).
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/forex2/fetch-fx-daily.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../../lib/sandbox-io";
setupSandboxIO();

interface DailyBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

const OUTPUT_DIR = join(process.cwd(), "results", "block8-2", "datasets", "fx");

const PAIRS = [
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "USDCHF",
  "NZDUSD",
  "EURGBP",
  "EURJPY",
  "GBPJPY",
  "AUDJPY",
];

interface YahooChartResponse {
  chart: {
    result?: [
      {
        timestamp: number[];
        indicators: { quote: [{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[] }] };
      },
    ];
  };
}

async function fetchDaily(symbol: string): Promise<DailyBar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}=X?interval=1d&range=15y`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (response.status !== 200) {
    throw new Error(`Yahoo chart fetch failed for ${symbol}: HTTP ${response.status}`);
  }
  const raw = (await response.json()) as YahooChartResponse;
  const result = raw.chart.result?.[0];
  if (!result) return [];
  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];
  const bars: DailyBar[] = [];
  for (let i = 0; i < timestamp.length; i++) {
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const close = quote.close[i];
    if (open === null || high === null || low === null || close === null) continue;
    const date = new Date(timestamp[i] * 1000).toISOString().slice(0, 10);
    bars.push({ date, open, high, low, close });
  }
  return bars;
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const report: Record<string, { bars: number; from: string; to: string }> = {};

  for (const pair of PAIRS) {
    console.log(`[Block 8.2] Fetching ${pair} daily ...`);
    const bars = await fetchDaily(pair);
    writeFileSync(join(OUTPUT_DIR, `${pair}_1d.json`), JSON.stringify(bars));
    report[pair] = { bars: bars.length, from: bars[0]?.date ?? "", to: bars[bars.length - 1]?.date ?? "" };
  }

  writeFileSync(join(OUTPUT_DIR, "_fetch-report.json"), JSON.stringify(report, null, 2));
  console.log("[Block 8.2] Done.");
  for (const [pair, r] of Object.entries(report)) console.log(`  ${pair}: ${r.bars} bars (${r.from} -> ${r.to})`);
}

main().catch((error) => {
  console.error("[Block 8.2] fetch-fx-daily failed:", error);
  process.exitCode = 1;
});
