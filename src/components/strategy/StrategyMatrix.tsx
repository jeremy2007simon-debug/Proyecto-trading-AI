import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SignalBadge } from "@/components/ui/SignalBadge";
import type { MarketRegime } from "@/core/market-regime/types";
import type { Market, SignalDirection, Timeframe } from "@/core/shared/types";

/**
 * `StrategyMatrix`'s own prop shape — it owns this type, not the other
 * way around. `src/lib/mock/strategy-matrix.mock.ts` imports it from
 * here so the mock and any real data source (`getStrategySignals`) are
 * both just producers of the same shape this component already expects.
 */
export interface StrategyMatrixRow {
  strategyId: string;
  strategyName: string;
  market: Market;
  timeframe: Timeframe;
  signal: SignalDirection;
  weight: number;
  rawScore: number;
  currentRegime: MarketRegime;
  compatibleWithCurrentRegime: boolean;
  enabled: boolean;
  winRate?: number;
  profitFactor?: number;
  sampleSize?: number;
}

interface StrategyMatrixProps {
  rows: StrategyMatrixRow[];
  headerAction?: ReactNode;
}

/**
 * Presentational only — receives its rows as a prop and has no idea
 * whether they came from `src/lib/mock/strategy-matrix.mock.ts` or a
 * real Strategy Manager run. Swapping to live data means changing the
 * page that renders this component, never this file.
 */
export function StrategyMatrix({ rows, headerAction }: StrategyMatrixProps) {
  return (
    <Card>
      <CardHeader
        title="Strategy Matrix"
        description="Per-strategy signal, weight, and compatibility with the current market regime."
        action={headerAction}
      />
      <CardBody className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs text-muted">
              <th className="px-5 py-3 font-medium">Strategy</th>
              <th className="px-5 py-3 font-medium">Signal</th>
              <th className="px-5 py-3 font-medium">Weight</th>
              <th className="px-5 py-3 font-medium">Regime fit</th>
              <th className="px-5 py-3 font-medium">Score</th>
              <th className="px-5 py-3 font-medium">Win rate</th>
              <th className="px-5 py-3 font-medium">Profit factor</th>
              <th className="px-5 py-3 font-medium">Sample</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.strategyId}
                className="border-b border-border-subtle last:border-0"
              >
                <td className="px-5 py-3">
                  <Link
                    href={`/strategies/${row.strategyId}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {row.strategyName}
                  </Link>
                  <p className="text-xs text-muted">
                    {row.market} · {row.timeframe}
                  </p>
                </td>
                <td className="px-5 py-3">
                  <SignalBadge signal={row.signal} size="sm" />
                </td>
                <td className="px-5 py-3 tabular-nums text-foreground">
                  {(row.weight * 100).toFixed(0)}%
                </td>
                <td className="px-5 py-3">
                  {row.compatibleWithCurrentRegime ? (
                    <span className="text-buy">Compatible</span>
                  ) : (
                    <span className="text-muted-foreground">
                      Not compatible ({row.currentRegime})
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 tabular-nums text-foreground">
                  {row.rawScore > 0 ? "+" : ""}
                  {row.rawScore}
                </td>
                <td className="px-5 py-3 tabular-nums text-muted">
                  {row.winRate !== undefined
                    ? `${(row.winRate * 100).toFixed(0)}%`
                    : "—"}
                </td>
                <td className="px-5 py-3 tabular-nums text-muted">
                  {row.profitFactor?.toFixed(2) ?? "—"}
                </td>
                <td className="px-5 py-3 tabular-nums text-muted">
                  {row.sampleSize ?? "—"}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={
                      row.enabled
                        ? "text-buy"
                        : "text-muted-foreground"
                    }
                  >
                    {row.enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}
