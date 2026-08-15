import { DataUnavailableNotice } from "@/components/dashboard/DataUnavailableNotice";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { RegimeSummaryPanel } from "@/components/market/RegimeSummaryPanel";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { getMarketOverview } from "@/lib/data/market-overview.server";
import { getRegimeHistory } from "@/lib/data/market-regimes.repository";

const MARKET = "SP500" as const;
const TIMEFRAME = "15m" as const;

export default async function MarketRegimePage() {
  const [overview, history] = await Promise.all([
    getMarketOverview(MARKET, TIMEFRAME),
    getRegimeHistory(MARKET, TIMEFRAME, 10).catch(() => []),
  ]);

  return (
    <div>
      <PageHeader
        title="Market Regime"
        description="Current classification and recent regime history."
      />

      {overview.ok ? (
        <RegimeSummaryPanel data={overview.value} />
      ) : (
        <DataUnavailableNotice reason={overview.error.reason} />
      )}

      {history.length > 0 ? (
        <div className="mt-6">
          <Card>
            <CardHeader title="Regime history" description="Most recent stored transitions." />
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-muted">
                    <th className="px-5 py-3 font-medium">Regime</th>
                    <th className="px-5 py-3 font-medium">Previous</th>
                    <th className="px-5 py-3 font-medium">Started</th>
                    <th className="px-5 py-3 font-medium">Ended</th>
                    <th className="px-5 py-3 font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-5 py-2.5 text-foreground">{row.regime}</td>
                      <td className="px-5 py-2.5 text-muted">{row.previousRegime ?? "—"}</td>
                      <td className="px-5 py-2.5 text-muted">
                        {new Date(row.timestamp).toLocaleString()}
                      </td>
                      <td className="px-5 py-2.5 text-muted">
                        {row.endedAt ? new Date(row.endedAt).toLocaleString() : "ongoing"}
                      </td>
                      <td className="px-5 py-2.5 tabular-nums text-muted">
                        {row.confidenceScore.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
