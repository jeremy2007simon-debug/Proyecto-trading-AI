import { notFound } from "next/navigation";
import { DataUnavailableNotice } from "@/components/dashboard/DataUnavailableNotice";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RecentSignalsTable } from "@/components/strategy/RecentSignalsTable";
import { StrategyDetailPanel } from "@/components/strategy/StrategyDetailPanel";
import { getStrategyDetail } from "@/lib/data/strategy-signals.server";

const MARKET = "SP500" as const;
const TIMEFRAME = "15m" as const;

export default async function StrategyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getStrategyDetail(id, MARKET, TIMEFRAME);

  if (!detail.ok) {
    notFound();
  }

  const { registration, currentSignal, overviewUnavailable, recentSignals } = detail.value;

  return (
    <div>
      <PageHeader
        title={registration.name}
        description={`${MARKET} · ${TIMEFRAME}`}
      />

      {overviewUnavailable ? (
        <div className="mb-6">
          <DataUnavailableNotice reason={overviewUnavailable.reason} />
        </div>
      ) : null}

      <StrategyDetailPanel registration={registration} currentSignal={currentSignal} />

      <div className="mt-6">
        <RecentSignalsTable signals={recentSignals} />
      </div>
    </div>
  );
}
