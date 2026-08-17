import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SignalBadge } from "@/components/ui/SignalBadge";
import type { StrategySignalRecord } from "@/core/strategy-manager/types";

interface RecentSignalsTableProps {
  signals: StrategySignalRecord[];
}

export function RecentSignalsTable({ signals }: RecentSignalsTableProps) {
  return (
    <Card>
      <CardHeader title="Recent signals" description="Every evaluation is persisted, WAIT included." />
      <CardBody className="overflow-x-auto p-0">
        {signals.length > 0 ? (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs text-muted">
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Signal</th>
                <th className="px-5 py-3 font-medium">Score</th>
                <th className="px-5 py-3 font-medium">Regime</th>
                <th className="px-5 py-3 font-medium">Entry</th>
                <th className="px-5 py-3 font-medium">Stop</th>
                <th className="px-5 py-3 font-medium">Take profit</th>
                <th className="px-5 py-3 font-medium">R:R</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((row) => (
                <tr key={row.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-5 py-2.5 text-muted">{new Date(row.timestamp).toLocaleString()}</td>
                  <td className="px-5 py-2.5">
                    <SignalBadge signal={row.signal} size="sm" />
                  </td>
                  <td className="px-5 py-2.5 tabular-nums text-foreground">
                    {row.rawScore > 0 ? "+" : ""}
                    {row.rawScore.toFixed(0)}
                  </td>
                  <td className="px-5 py-2.5 text-muted">{row.marketRegime}</td>
                  <td className="px-5 py-2.5 tabular-nums text-muted">{row.entry?.toFixed(2) ?? "—"}</td>
                  <td className="px-5 py-2.5 tabular-nums text-muted">{row.stopLoss?.toFixed(2) ?? "—"}</td>
                  <td className="px-5 py-2.5 tabular-nums text-muted">{row.takeProfit?.toFixed(2) ?? "—"}</td>
                  <td className="px-5 py-2.5 tabular-nums text-muted">{row.riskReward?.toFixed(2) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-6 text-sm text-muted">No signal history yet.</p>
        )}
      </CardBody>
    </Card>
  );
}
