import { StatTile } from "@/components/dashboard/StatTile";
import { formatDurationShort } from "@/lib/format/duration";
import type { MarketOverview } from "@/lib/data/market-overview.server";

const DATA_QUALITY_COLOR: Record<string, string> = {
  PASS: "text-buy",
  WARN: "text-wait",
  FAIL: "text-sell",
};

interface MarketOverviewPanelProps {
  data: MarketOverview;
}

/**
 * Presentational — receives an already-fetched `MarketOverview`. Every
 * value shown here comes from the real pipeline (provider -> data
 * quality -> indicators -> regime); there is no mock fallback in this
 * component.
 */
export function MarketOverviewPanel({ data }: MarketOverviewPanelProps) {
  const { indicators, regime, dataQuality, marketStatus, regimeDurationMs } = data;

  const volumeVsAverage =
    indicators.currentVolume !== undefined && indicators.averageVolume
      ? `${((indicators.currentVolume / indicators.averageVolume) * 100).toFixed(0)}%`
      : "—";

  const regimeDuration =
    regimeDurationMs !== undefined ? formatDurationShort(regimeDurationMs) : "—";

  return (
    <div>
      <div className="mb-6 flex items-baseline gap-3">
        <h2 className="text-2xl font-semibold text-foreground">{data.market}</h2>
        <span className="font-mono text-2xl text-foreground">
          {data.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile
          label="Market status"
          value={marketStatus.session}
          valueClassName={marketStatus.isOpen ? "text-buy" : "text-muted-foreground"}
        />
        <StatTile label="Timeframe" value={data.timeframe} />
        <StatTile label="Last updated" value={new Date(data.lastUpdated).toLocaleString()} />
        <StatTile label="Data provider" value={data.provider} />
        <StatTile
          label="Data quality"
          value={dataQuality.status}
          valueClassName={DATA_QUALITY_COLOR[dataQuality.status]}
        />
        <StatTile label="Current regime" value={regime.regime} />
        <StatTile label="Previous regime" value={regime.previousRegime ?? "—"} />
        <StatTile label="Regime duration" value={regimeDuration} />
        <StatTile label="EMA 20" value={indicators.ema20?.toFixed(2) ?? "—"} />
        <StatTile label="EMA 50" value={indicators.ema50?.toFixed(2) ?? "—"} />
        <StatTile label="EMA 200" value={indicators.ema200?.toFixed(2) ?? "—"} />
        <StatTile label="RSI (14)" value={indicators.rsi14?.toFixed(1) ?? "—"} />
        <StatTile label="ATR (14)" value={indicators.atr14?.toFixed(2) ?? "—"} />
        <StatTile
          label="VWAP"
          value={indicators.vwap?.value.toFixed(2) ?? "—"}
          hint={
            indicators.vwap
              ? `${indicators.vwap.distancePct >= 0 ? "+" : ""}${indicators.vwap.distancePct.toFixed(2)}% vs close`
              : undefined
          }
        />
        <StatTile label="ADX (14)" value={indicators.adx14?.adx.toFixed(1) ?? "—"} />
        <StatTile label="Volume vs average" value={volumeVsAverage} />
      </div>
    </div>
  );
}
