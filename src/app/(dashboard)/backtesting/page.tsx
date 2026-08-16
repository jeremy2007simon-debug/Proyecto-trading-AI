import { PageHeader } from "@/components/dashboard/PageHeader";
import { BacktestWorkbench } from "@/components/backtesting/BacktestWorkbench";
import { getDefaultStrategyManager } from "@/core/strategy-manager/registry";

export default function BacktestingPage() {
  const strategies = getDefaultStrategyManager()
    .listRegistrations("SP500")
    .map((r) => ({ id: r.strategy.id, name: r.strategy.name }));

  return (
    <div>
      <PageHeader
        title="Backtesting"
        description="Event-driven, no-look-ahead simulation of a single strategy over real historical candles. Results are never tuned — a losing run is a valid, reported result."
      />
      <BacktestWorkbench strategies={strategies} />
    </div>
  );
}
