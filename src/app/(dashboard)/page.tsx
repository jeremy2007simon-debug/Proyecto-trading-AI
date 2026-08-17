import { DataUnavailableNotice } from "@/components/dashboard/DataUnavailableNotice";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { MarketOverviewPanel } from "@/components/market/MarketOverviewPanel";
import { getMarketOverview } from "@/lib/data/market-overview.server";

export default async function DashboardPage() {
  const overview = await getMarketOverview("SP500", "15m");

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Market snapshot for the active instrument."
      />
      {overview.ok ? (
        <MarketOverviewPanel data={overview.value} />
      ) : (
        <DataUnavailableNotice reason={overview.error.reason} />
      )}
    </div>
  );
}
