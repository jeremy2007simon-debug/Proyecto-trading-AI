import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import type { Candle } from "@/core/market-data/types";
import type { Market, Timeframe } from "@/core/shared/types";

/**
 * Block 8 (Forex Research Lab) — reads the local candle cache written by
 * `scripts/research/forex/fetch-fx-candles.ts`
 * (`results/block8/forex/data/<market>_<timeframe>.json`). Deliberately
 * NOT a full `MarketDataProvider` implementation (no live
 * `getCurrentPrice`/`getMarketStatus` need — this research only ever
 * backtests against a frozen historical window) — a full
 * `MarketDataProvider` adapter can be added in a later block if FX ever
 * moves toward live paper/demo evaluation. `results/` is gitignored (see
 * `.gitignore`), same convention as every other block's raw research
 * artifacts — re-run the fetch script to regenerate this cache.
 */
export function loadFxCandles(market: Market, timeframe: Timeframe, cacheDir?: string): Candle[] {
  const dir = cacheDir ?? join(process.cwd(), "results", "block8", "forex", "data");
  const path = join(dir, `${market}_${timeframe}.json`);
  if (!existsSync(path)) {
    throw new Error(
      `No cached FX candles at ${path}. Run 'NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/forex/fetch-fx-candles.ts' first.`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as Candle[];
}
