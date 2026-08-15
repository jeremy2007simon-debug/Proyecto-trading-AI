import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { MockDataBadge } from "@/components/ui/MockDataBadge";
import { mockMarketOverview } from "@/lib/mock/market-overview.mock";

export default function DashboardPage() {
  const m = mockMarketOverview;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Market snapshot for the active instrument."
        action={<MockDataBadge />}
      />

      <div className="mb-6 flex items-baseline gap-3">
        <h2 className="text-2xl font-semibold text-foreground">
          {m.displayName}
        </h2>
        <span className="font-mono text-2xl text-foreground">
          {m.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
        <span className={m.changePct >= 0 ? "text-buy" : "text-sell"}>
          {m.changePct >= 0 ? "+" : ""}
          {m.changePct.toFixed(2)}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Market status" value="Open" valueClassName="text-buy" />
        <StatTile label="Market regime" value={m.regime} />
        <StatTile label="Timeframe" value={m.timeframe} />
        <StatTile
          label="Last updated"
          value={new Date(m.lastUpdated).toLocaleTimeString()}
        />
        <StatTile
          label="Realized volatility"
          value={`${m.realizedVolatility.toFixed(1)}%`}
        />
        <StatTile
          label="Momentum"
          value={m.momentum > 0 ? `+${m.momentum.toFixed(2)}` : m.momentum.toFixed(2)}
          valueClassName={m.momentum >= 0 ? "text-buy" : "text-sell"}
        />
        <StatTile
          label="Volume"
          value={m.volume.toLocaleString("en-US")}
          hint={`avg ${m.averageVolume.toLocaleString("en-US")}`}
        />
      </div>
    </div>
  );
}
