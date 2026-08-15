import { PageHeader } from "@/components/dashboard/PageHeader";
import { StrategyMatrix } from "@/components/strategy/StrategyMatrix";
import { MockDataBadge } from "@/components/ui/MockDataBadge";
import { mockStrategyMatrixRows } from "@/lib/mock/strategy-matrix.mock";

export default function StrategiesPage() {
  return (
    <div>
      <PageHeader
        title="Strategies"
        description="Registered strategies, their current signal, weight, and regime compatibility."
        action={<MockDataBadge />}
      />
      <StrategyMatrix rows={mockStrategyMatrixRows} />
    </div>
  );
}
