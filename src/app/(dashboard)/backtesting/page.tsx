import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function BacktestingPage() {
  return (
    <div>
      <PageHeader
        title="Backtesting"
        description="Run and review historical simulations of strategies or the full consensus pipeline."
      />
      <ComingSoon
        title="Backtesting Engine not implemented yet"
        description="This page will drive the BacktestingEngine (src/core/backtesting/types.ts) once it has a concrete implementation."
        plannedFeatures={[
          "Configure market, timeframe, date range, capital, risk %, commission, slippage",
          "Single strategy, multi-strategy, or full Consensus Engine mode",
          "Equity curve, drawdown, and monthly returns",
          "Results by strategy, regime, hour, and weekday",
          "Walk-forward training / validation / out-of-sample splits",
        ]}
      />
    </div>
  );
}
