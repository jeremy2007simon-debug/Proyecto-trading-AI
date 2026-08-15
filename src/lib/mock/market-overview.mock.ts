import type { MarketRegime } from "@/core/market-regime/types";
import type { Market, Timeframe } from "@/core/shared/types";
import { mockCurrentRegime } from "@/lib/mock/strategy-matrix.mock";

/** MOCK DATA — see strategy-matrix.mock.ts. No Market Data Engine is connected yet. */
export const IS_MOCK_DATA = true as const;

export interface MarketOverviewData {
  market: Market;
  displayName: string;
  price: number;
  changePct: number;
  timeframe: Timeframe;
  regime: MarketRegime;
  lastUpdated: string;
  realizedVolatility: number;
  momentum: number;
  volume: number;
  averageVolume: number;
}

export const mockMarketOverview: MarketOverviewData = {
  market: "SP500",
  displayName: "S&P 500",
  price: 5482.25,
  changePct: 0.64,
  timeframe: "15m",
  regime: mockCurrentRegime,
  lastUpdated: new Date().toISOString(),
  realizedVolatility: 12.4,
  momentum: 0.38,
  volume: 1_842_300,
  averageVolume: 1_610_000,
};
