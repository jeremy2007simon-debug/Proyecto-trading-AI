import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { Rs3mCurrentSignal } from "@/novacore/strategy-hub/adapters/rs3m-signal-adapter";

const STATUS_LABEL: Record<Rs3mCurrentSignal["status"], string> = {
  EXECUTED: "Executed",
  AWAITING_APPROVAL: "Awaiting approval",
  BLOCKED: "Blocked",
  NO_REBALANCE_NEEDED: "No rebalance needed",
  UNAVAILABLE: "Unavailable",
};

const STATUS_STYLE: Record<Rs3mCurrentSignal["status"], string> = {
  EXECUTED: "border-buy/30 bg-buy/10 text-buy",
  AWAITING_APPROVAL: "border-wait/30 bg-wait/10 text-wait",
  BLOCKED: "border-sell/30 bg-sell/10 text-sell",
  NO_REBALANCE_NEEDED: "border-accent/30 bg-accent/10 text-accent",
  UNAVAILABLE: "border-border bg-surface-raised text-muted",
};

/**
 * "Current RS3M Signal" panel (Observability Upgrade §4). Every field
 * here is read from `results/block6/forward/ledger.jsonl` — real dry-run
 * evidence, never a live-computed signal (NovaCore never calls
 * `signal-calculator.ts` itself). When the ledger has no rows, this
 * renders the unavailable state honestly instead of a fabricated ranking.
 */
export function SignalCard({ signal }: { signal: Rs3mCurrentSignal }) {
  if (signal.status === "UNAVAILABLE") {
    return (
      <Card>
        <CardHeader title="Current signal" description={`Decision month ${signal.currentDecisionMonth}`} />
        <CardBody className="p-4">
          <p className="text-sm text-muted">{signal.source}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Current signal"
        description={`Decision month ${signal.decisionMonth} · data cutoff ${signal.dataCutoff?.slice(0, 10)}${signal.signalAgeDays !== undefined ? ` · ${signal.signalAgeDays}d old` : ""}`}
        action={<span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[signal.status]}`}>{STATUS_LABEL[signal.status]}</span>}
      />
      <CardBody className="p-4">
        {signal.ranking.length > 0 ? (
          <ol className="space-y-1.5">
            {[...signal.ranking]
              .sort((a, b) => b.trailingReturnPct - a.trailingReturnPct)
              .map((r, i) => (
                <li key={r.market} className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-raised px-3 py-1.5 text-sm">
                  <span className="text-foreground">
                    {i + 1}. {r.market} <span className="text-muted-foreground">({r.ticker})</span>
                  </span>
                  <span className="font-mono text-muted">{r.trailingReturnPct >= 0 ? "+" : ""}{r.trailingReturnPct.toFixed(2)}%</span>
                </li>
              ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">No ranking recorded for this row.</p>
        )}

        {signal.winner ? (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-accent/30 bg-accent/10 px-3 py-2">
            <span className="text-sm font-medium text-foreground">Winner</span>
            <span className="font-mono text-sm text-accent">
              {signal.winner} → {signal.winnerTicker}
            </span>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          <div>
            <p className="text-muted">Candidate hash</p>
            <p className="font-mono text-foreground">{signal.candidateHash}</p>
          </div>
          {signal.estimatedTurnoverPct !== undefined ? (
            <div>
              <p className="text-muted">Est. turnover</p>
              <p className="font-mono text-foreground">{signal.estimatedTurnoverPct.toFixed(2)}%</p>
            </div>
          ) : null}
          {signal.proposedOrders.length > 0 ? (
            <div>
              <p className="text-muted">Proposed notional</p>
              <p className="font-mono text-foreground">${signal.proposedOrders.reduce((s, o) => s + o.notionalUsd, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
          ) : null}
        </div>

        {signal.guardViolations.length > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Blocked by: {signal.guardViolations.map((v) => v.guard).join(", ")}
          </p>
        ) : null}

        <p className="mt-4 text-[11px] text-muted-foreground">
          This is the last recorded dry-run for this decision month — a reference, not a live signal. Source: {signal.source}
        </p>
      </CardBody>
    </Card>
  );
}
