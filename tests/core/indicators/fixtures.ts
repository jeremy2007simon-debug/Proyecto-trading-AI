import type { Candle } from "@/core/market-data/types";

interface Bar {
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  timestamp?: string;
}

/** Builds a minimal, deterministic Candle series from a compact bar spec for hand-computable tests. */
export function buildCandles(bars: Bar[]): Candle[] {
  return bars.map((bar, i) => ({
    market: "SP500",
    timeframe: "1d",
    timestamp: bar.timestamp ?? new Date(Date.UTC(2024, 0, i + 1)).toISOString(),
    symbol: "TEST",
    provider: "test-fixture",
    open: bar.open ?? bar.close,
    high: bar.high ?? bar.close,
    low: bar.low ?? bar.close,
    close: bar.close,
    volume: bar.volume ?? 1000,
  }));
}
