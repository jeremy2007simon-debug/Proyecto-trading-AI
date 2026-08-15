import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SignalBadge } from "@/components/ui/SignalBadge";
import type { ConsensusPanelData } from "@/lib/mock/consensus-panel.mock";

interface ConsensusPanelProps {
  data: ConsensusPanelData;
}

function WeightBar({
  buyWeight,
  sellWeight,
  waitWeight,
}: Pick<ConsensusPanelData, "buyWeight" | "sellWeight" | "waitWeight">) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-border-subtle">
      <div
        className="bg-buy"
        style={{ width: `${buyWeight * 100}%` }}
        title={`BUY weight: ${(buyWeight * 100).toFixed(0)}%`}
      />
      <div
        className="bg-sell"
        style={{ width: `${sellWeight * 100}%` }}
        title={`SELL weight: ${(sellWeight * 100).toFixed(0)}%`}
      />
      <div
        className="bg-wait"
        style={{ width: `${waitWeight * 100}%` }}
        title={`WAIT weight: ${(waitWeight * 100).toFixed(0)}%`}
      />
    </div>
  );
}

/**
 * Presentational only — receives `data` as a prop. `consensusScore` and
 * `conflictScore` are internal agreement measures, not probabilities:
 * this component never renders them as a "confidence %".
 */
export function ConsensusPanel({ data }: ConsensusPanelProps) {
  return (
    <Card>
      <CardHeader
        title="Consensus Panel"
        description="Aggregated decision across all enabled strategies for the current regime."
      />
      <CardBody className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">Final decision</p>
            <div className="mt-1">
              <SignalBadge signal={data.finalDecision} size="lg" />
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Consensus score</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
              {data.consensusScore > 0 ? "+" : ""}
              {data.consensusScore}
            </p>
            <p className="text-[11px] text-muted-foreground">
              internal agreement, -100..+100 — not a probability
            </p>
          </div>
        </div>

        <div>
          <WeightBar
            buyWeight={data.buyWeight}
            sellWeight={data.sellWeight}
            waitWeight={data.waitWeight}
          />
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span className="text-buy">
              BUY {(data.buyWeight * 100).toFixed(0)}%
            </span>
            <span className="text-sell">
              SELL {(data.sellWeight * 100).toFixed(0)}%
            </span>
            <span className="text-wait">
              WAIT {(data.waitWeight * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t border-border-subtle pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Conflict score</dt>
            <dd className="mt-0.5 tabular-nums text-foreground">
              {data.conflictScore.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Market regime</dt>
            <dd className="mt-0.5 text-foreground">{data.marketRegime}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Risk decision</dt>
            <dd
              className={`mt-0.5 font-medium ${
                data.riskApproved ? "text-buy" : "text-sell"
              }`}
            >
              {data.riskApproved ? "Approved" : "Rejected"}
              {data.riskRejectionReason ? ` — ${data.riskRejectionReason}` : ""}
            </dd>
          </div>
          {data.entry !== undefined ? (
            <div>
              <dt className="text-xs text-muted">Entry</dt>
              <dd className="mt-0.5 tabular-nums text-foreground">
                {data.entry}
              </dd>
            </div>
          ) : null}
          {data.stopLoss !== undefined ? (
            <div>
              <dt className="text-xs text-muted">Stop loss</dt>
              <dd className="mt-0.5 tabular-nums text-sell">
                {data.stopLoss}
              </dd>
            </div>
          ) : null}
          {data.takeProfit !== undefined ? (
            <div>
              <dt className="text-xs text-muted">Take profit</dt>
              <dd className="mt-0.5 tabular-nums text-buy">
                {data.takeProfit}
              </dd>
            </div>
          ) : null}
          {data.riskReward !== undefined ? (
            <div>
              <dt className="text-xs text-muted">Risk / reward</dt>
              <dd className="mt-0.5 tabular-nums text-foreground">
                1:{data.riskReward.toFixed(2)}
              </dd>
            </div>
          ) : null}
        </dl>
      </CardBody>
    </Card>
  );
}
