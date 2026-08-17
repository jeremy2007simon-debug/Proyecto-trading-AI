"use client";

import { Fragment, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { BacktestTrade } from "@/core/backtesting/types";

interface TradeAuditTableProps {
  trades: BacktestTrade[];
}

function fmtTime(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/**
 * Every trade individually auditable (point 24): entry/exit timestamps
 * and prices, stop/target, exit reason, R result, market regime at
 * entry, indicators at entry, rules triggered, and costs paid. Rows
 * expand on click; nothing is summarized away.
 */
export function TradeAuditTable({ trades }: TradeAuditTableProps) {
  const [expandedId, setExpandedId] = useState<string | undefined>();

  return (
    <Card>
      <CardHeader title="Trade audit" description={`${trades.length} trades — click a row to inspect.`} />
      <CardBody className="overflow-x-auto p-0">
        {trades.length > 0 ? (
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs text-muted">
                <th className="px-5 py-3 font-medium">Entry</th>
                <th className="px-5 py-3 font-medium">Dir</th>
                <th className="px-5 py-3 font-medium">Entry price</th>
                <th className="px-5 py-3 font-medium">Exit price</th>
                <th className="px-5 py-3 font-medium">Exit reason</th>
                <th className="px-5 py-3 font-medium">R</th>
                <th className="px-5 py-3 font-medium">P&L</th>
                <th className="px-5 py-3 font-medium">Regime</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const isExpanded = expandedId === trade.id;
                return (
                  <Fragment key={trade.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? undefined : trade.id)}
                      className="cursor-pointer border-b border-border-subtle last:border-0 hover:bg-surface-raised"
                    >
                      <td className="px-5 py-2.5 text-muted">{fmtTime(trade.entryAt)}</td>
                      <td className="px-5 py-2.5">
                        <span className={trade.direction === "BUY" ? "text-buy" : "text-sell"}>
                          {trade.direction}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 tabular-nums text-foreground">
                        {trade.entryPrice.toFixed(2)}
                      </td>
                      <td className="px-5 py-2.5 tabular-nums text-foreground">
                        {trade.exitPrice?.toFixed(2) ?? "—"}
                      </td>
                      <td className="px-5 py-2.5 text-muted">
                        {trade.exitReason ?? "—"}
                        {trade.ambiguousIntrabarExit ? (
                          <span className="ml-1.5 rounded border border-wait/30 bg-wait/10 px-1.5 py-0.5 text-[10px] text-wait">
                            AMBIGUOUS
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={`px-5 py-2.5 tabular-nums ${
                          (trade.pnlR ?? 0) >= 0 ? "text-buy" : "text-sell"
                        }`}
                      >
                        {trade.pnlR !== undefined ? `${trade.pnlR >= 0 ? "+" : ""}${trade.pnlR.toFixed(2)}R` : "—"}
                      </td>
                      <td
                        className={`px-5 py-2.5 tabular-nums ${
                          (trade.pnlAmount ?? 0) >= 0 ? "text-buy" : "text-sell"
                        }`}
                      >
                        {trade.pnlAmount !== undefined
                          ? `${trade.pnlAmount >= 0 ? "+" : ""}$${trade.pnlAmount.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-muted">{trade.marketRegimeAtEntry ?? "—"}</td>
                    </tr>
                    {isExpanded ? (
                      <tr className="border-b border-border-subtle bg-surface-raised">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs sm:grid-cols-4">
                            <div>
                              <p className="text-muted">Strategy version</p>
                              <p className="text-foreground">{trade.strategyVersion ?? "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted">Stop loss</p>
                              <p className="text-foreground">{trade.stopLoss.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-muted">Take profit</p>
                              <p className="text-foreground">{trade.takeProfit?.toFixed(2) ?? "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted">Exit time</p>
                              <p className="text-foreground">{fmtTime(trade.exitAt)}</p>
                            </div>
                            <div>
                              <p className="text-muted">Commission paid</p>
                              <p className="text-foreground">${trade.commissionPaid.toFixed(4)}</p>
                            </div>
                            <div>
                              <p className="text-muted">Slippage paid</p>
                              <p className="text-foreground">${trade.slippagePaid.toFixed(4)}</p>
                            </div>
                            <div className="col-span-2 sm:col-span-4">
                              <p className="text-muted">Rules triggered</p>
                              <p className="text-foreground">
                                {trade.rulesTriggered.length > 0 ? trade.rulesTriggered.join(", ") : "—"}
                              </p>
                            </div>
                            <div className="col-span-2 sm:col-span-4">
                              <p className="text-muted">Indicators at entry</p>
                              <p className="break-all font-mono text-[11px] text-foreground">
                                {trade.indicatorsAtEntry
                                  ? JSON.stringify(trade.indicatorsAtEntry)
                                  : "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-6 text-sm text-muted">No trades were opened during this run.</p>
        )}
      </CardBody>
    </Card>
  );
}
