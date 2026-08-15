import type {
  Candle,
  MarketDataError,
  MarketDataProvider,
  MarketDataRequest,
} from "@/core/market-data/types";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import type { MarketStatus } from "@/core/market-hours/types";
import { TIMEFRAME_MINUTES } from "@/core/shared/timeframe";
import type { Market, Result, Timeframe } from "@/core/shared/types";

/**
 * Deterministic in-memory `MarketDataProvider`, used ONLY by unit tests
 * for indicators / regime / data-quality / dashboard components. Never
 * imported by any page or API route — a real deployment must either
 * have a configured provider or explicitly render "data unavailable",
 * never silently fall back to synthetic data.
 */
export class InMemoryMockMarketDataProvider implements MarketDataProvider {
  readonly id = "mock-in-memory";
  readonly supportedMarkets: readonly Market[] = ["SP500"];

  private readonly basePrice: number;

  constructor(basePrice = 500) {
    this.basePrice = basePrice;
  }

  private generateCandles(request: MarketDataRequest): Candle[] {
    const stepMs = TIMEFRAME_MINUTES[request.timeframe] * 60 * 1000;
    const fromMs = new Date(request.from).getTime();
    const toMs = request.to ? new Date(request.to).getTime() : fromMs + stepMs * (request.limit ?? 100);
    const count = request.limit ?? Math.max(1, Math.floor((toMs - fromMs) / stepMs));

    const candles: Candle[] = [];
    for (let i = 0; i < count; i++) {
      const t = fromMs + i * stepMs;
      // Deterministic pseudo-walk: smooth sine drift, never random —
      // repeated calls with the same request produce identical output.
      const drift = Math.sin(i / 12) * 3 + i * 0.02;
      const open = this.basePrice + drift;
      const close = open + Math.sin(i / 5) * 0.5;
      const high = Math.max(open, close) + 0.3;
      const low = Math.min(open, close) - 0.3;
      const volume = 1_000_000 + Math.round(Math.abs(Math.sin(i / 7)) * 500_000);

      candles.push({
        market: request.market,
        timeframe: request.timeframe,
        timestamp: new Date(t).toISOString(),
        symbol: "MOCK",
        provider: this.id,
        open,
        high,
        low,
        close,
        volume,
      });
    }
    return candles;
  }

  async getHistoricalCandles(
    request: MarketDataRequest,
  ): Promise<Result<Candle[], MarketDataError>> {
    return { ok: true, value: this.generateCandles(request) };
  }

  async getLatestCandle(
    market: Market,
    timeframe: Timeframe,
  ): Promise<Result<Candle, MarketDataError>> {
    const [candle] = this.generateCandles({
      market,
      timeframe,
      from: new Date().toISOString(),
      limit: 1,
    });
    return { ok: true, value: candle };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- market is part of the MarketDataProvider contract even though this mock ignores it
  async getCurrentPrice(market: Market): Promise<Result<number, MarketDataError>> {
    return { ok: true, value: this.basePrice };
  }

  async getMarketStatus(market: Market): Promise<Result<MarketStatus, MarketDataError>> {
    return { ok: true, value: createNyseCalendar(market).getStatus(new Date()) };
  }
}
