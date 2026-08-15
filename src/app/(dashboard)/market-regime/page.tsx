import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function MarketRegimePage() {
  return (
    <div>
      <PageHeader
        title="Market Regime"
        description="Current and historical classification produced by the Market Regime Detector."
      />
      <ComingSoon
        title="Market Regime Detector not running yet"
        description="This page will show live regime classification once a MarketRegimeDetector (src/core/market-regime/types.ts) is implemented against real candles."
        plannedFeatures={[
          "Current regime, previous regime, and duration",
          "Indicators used for the classification (EMA slope, ATR, ADX, VWAP distance, ...)",
          "Full regime history timeline",
          "Performance by regime and strategies recommended per regime",
        ]}
      />
    </div>
  );
}
