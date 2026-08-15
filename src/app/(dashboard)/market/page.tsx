import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function MarketPage() {
  return (
    <div>
      <PageHeader
        title="Market"
        description="Live and historical candle data for the active market."
      />
      <ComingSoon
        title="Market Data Engine not connected yet"
        description="This page will render live/historical candles once a MarketDataProvider (src/core/market-data/types.ts) is wired up."
        plannedFeatures={[
          "Live and historical OHLCV chart",
          "Timeframe switcher (1m .. 1d)",
          "Multi-market selector (SP500 active; Nasdaq 100, Forex, Gold, Bitcoin planned)",
          "Data quality / feed status indicator",
        ]}
      />
    </div>
  );
}
