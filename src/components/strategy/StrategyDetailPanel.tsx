import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SignalBadge } from "@/components/ui/SignalBadge";
import type { StrategyRegistrationSummary } from "@/lib/data/strategy-signals.server";
import type { StrategySignal } from "@/core/strategy-manager/types";

interface StrategyDetailPanelProps {
  registration: StrategyRegistrationSummary;
  /** The strategy's own signal from the current live evaluation — undefined only when that evaluation itself is unavailable. */
  currentSignal?: StrategySignal;
}

/**
 * Everything about a strategy EXCEPT profitability metrics (win rate,
 * profit factor, expectancy, ...) — no real backtests exist yet, so
 * showing those numbers here would fabricate a track record. Once
 * backtesting exists, that belongs in its own panel, not this one.
 */
export function StrategyDetailPanel({ registration, currentSignal }: StrategyDetailPanelProps) {
  const parameterEntries = Object.entries(registration.parameters);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title={registration.name}
          description={`v${registration.version} · ${registration.enabled ? "Enabled" : "Disabled"}`}
        />
        <CardBody className="space-y-4">
          <p className="text-sm text-muted">{registration.description}</p>

          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Compatible regimes
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {registration.compatibleRegimes.map((regime) => (
                <span
                  key={regime}
                  className="rounded-md border border-border-subtle bg-surface-subtle px-2 py-1 text-xs text-foreground"
                >
                  {regime}
                </span>
              ))}
            </div>
          </div>

          {parameterEntries.length > 0 ? (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Parameters
              </h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                {parameterEntries.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2 sm:flex-col sm:justify-start">
                    <dt className="text-muted">{key}</dt>
                    <dd className="tabular-nums text-foreground">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Current signal" description="From the latest live evaluation." />
        <CardBody className="space-y-3">
          {currentSignal ? (
            <>
              <div className="flex items-center justify-between">
                <SignalBadge signal={currentSignal.signal} size="lg" />
                <span className="tabular-nums text-lg font-semibold text-foreground">
                  {currentSignal.rawScore > 0 ? "+" : ""}
                  {currentSignal.rawScore.toFixed(0)}
                </span>
              </div>

              {currentSignal.entry !== undefined ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <div className="flex justify-between sm:flex-col">
                    <dt className="text-muted">Entry</dt>
                    <dd className="tabular-nums text-foreground">{currentSignal.entry.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between sm:flex-col">
                    <dt className="text-muted">Stop loss</dt>
                    <dd className="tabular-nums text-foreground">{currentSignal.stopLoss?.toFixed(2) ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between sm:flex-col">
                    <dt className="text-muted">Take profit</dt>
                    <dd className="tabular-nums text-foreground">{currentSignal.takeProfit?.toFixed(2) ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between sm:flex-col">
                    <dt className="text-muted">Risk:reward</dt>
                    <dd className="tabular-nums text-foreground">
                      {currentSignal.riskReward?.toFixed(2) ?? "—"}
                    </dd>
                  </div>
                </dl>
              ) : null}

              <p className="text-sm text-muted">{currentSignal.explanation}</p>

              {currentSignal.rulesTriggered.length > 0 ? (
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Rules triggered
                  </h3>
                  <ul className="mt-1 space-y-0.5 text-xs text-buy">
                    {currentSignal.rulesTriggered.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {currentSignal.rulesFailed.length > 0 ? (
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Rules failed
                  </h3>
                  <ul className="mt-1 space-y-0.5 text-xs text-sell">
                    {currentSignal.rulesFailed.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted">No current signal available.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
