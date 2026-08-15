import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function PaperTradingPage() {
  return (
    <div>
      <PageHeader
        title="Paper Trading"
        description="Simulated trades opened from approved final signals. No real broker is connected."
      />
      <ComingSoon
        title="Paper Trading Engine not implemented yet"
        description="This page will list simulated positions once a PaperTradingEngine (src/core/paper-trading/types.ts) is implemented and fed by real final signals."
        plannedFeatures={[
          "Open and closed simulated positions with entry, stop, target, size",
          "Simulated commission and slippage",
          "Strategies, regime, and consensus score attached to each trade",
          "Realized / unrealized P&L in currency and R multiples",
        ]}
      />
    </div>
  );
}
