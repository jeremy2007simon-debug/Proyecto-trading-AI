import { DataUnavailableNotice } from "@/components/dashboard/DataUnavailableNotice";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { createMarketDataProvider } from "@/core/market-data/provider-factory";

const MARKET = "SP500" as const;
const TIMEFRAME = "15m" as const;
const LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;
const CANDLE_LIMIT = 30;

export default async function MarketPage() {
  const providerResult = createMarketDataProvider();
  if (!providerResult.ok) {
    return (
      <div>
        <PageHeader
          title="Market"
          description="Live and historical candle data for the active market."
        />
        <DataUnavailableNotice reason={providerResult.error.message} />
      </div>
    );
  }

  const now = new Date();
  const candlesResult = await providerResult.value.getHistoricalCandles({
    market: MARKET,
    timeframe: TIMEFRAME,
    from: new Date(now.getTime() - LOOKBACK_MS).toISOString(),
    to: now.toISOString(),
    limit: CANDLE_LIMIT,
  });

  return (
    <div>
      <PageHeader
        title="Market"
        description={`Recent candles from ${providerResult.value.id}.`}
      />
      {!candlesResult.ok ? (
        <DataUnavailableNotice reason={candlesResult.error.message} />
      ) : (
        <Card>
          <CardHeader
            title="Recent candles"
            description={`${MARKET} (SPY) · ${TIMEFRAME} · ${candlesResult.value.length} bars`}
          />
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs text-muted">
                  <th className="px-5 py-3 font-medium">Time</th>
                  <th className="px-5 py-3 font-medium">Open</th>
                  <th className="px-5 py-3 font-medium">High</th>
                  <th className="px-5 py-3 font-medium">Low</th>
                  <th className="px-5 py-3 font-medium">Close</th>
                  <th className="px-5 py-3 font-medium">Volume</th>
                </tr>
              </thead>
              <tbody>
                {[...candlesResult.value].reverse().map((c) => (
                  <tr key={c.timestamp} className="border-b border-border-subtle last:border-0">
                    <td className="px-5 py-2.5 text-muted">
                      {new Date(c.timestamp).toLocaleString()}
                    </td>
                    <td className="px-5 py-2.5 tabular-nums text-foreground">{c.open.toFixed(2)}</td>
                    <td className="px-5 py-2.5 tabular-nums text-foreground">{c.high.toFixed(2)}</td>
                    <td className="px-5 py-2.5 tabular-nums text-foreground">{c.low.toFixed(2)}</td>
                    <td className="px-5 py-2.5 tabular-nums text-foreground">{c.close.toFixed(2)}</td>
                    <td className="px-5 py-2.5 tabular-nums text-muted">
                      {c.volume.toLocaleString("en-US")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
