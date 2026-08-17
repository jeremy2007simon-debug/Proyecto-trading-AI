import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function AnalyticsPage() {
  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Aggregate performance across paper trades, strategies, and regimes."
      />
      <ComingSoon
        title="No paper trading history yet"
        description="Analytics need real paper_trades and performance_metrics rows. Metrics are only shown once the underlying sample size is sufficient — never guessed from a handful of trades."
        plannedFeatures={[
          "Win rate, profit factor, expectancy, max drawdown, average R",
          "Best / worst strategy, regime, and time window",
          "Sample-size guardrails before surfacing any metric",
        ]}
      />
    </div>
  );
}
