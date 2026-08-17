import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { MarketOverview } from "@/lib/data/market-overview.server";
import { formatDurationShort } from "@/lib/format/duration";

interface RegimeSummaryPanelProps {
  data: MarketOverview;
}

function volatilityLabel(volatilityScore: number | undefined): string {
  if (volatilityScore === undefined) return "—";
  if (volatilityScore >= 80) return "HIGH";
  if (volatilityScore <= 20) return "LOW";
  return "NORMAL";
}

function momentumLabel(momentumScore: number | undefined): string {
  if (momentumScore === undefined) return "—";
  if (momentumScore > 10) return "POSITIVE";
  if (momentumScore < -10) return "NEGATIVE";
  return "NEUTRAL";
}

/**
 * Presentational — receives an already-fetched `MarketOverview`.
 * `confidenceScore` and the sub-scores are internal, reproducible rule
 * agreement measures, never rendered as a probability/confidence %.
 */
export function RegimeSummaryPanel({ data }: RegimeSummaryPanelProps) {
  const { regime, indicators, regimeDurationMs } = data;
  const scores = regime.scores;
  const duration = regimeDurationMs !== undefined ? formatDurationShort(regimeDurationMs) : "—";

  return (
    <Card>
      <CardHeader
        title="Market Regime"
        description="Live output of the rule-based Market Regime Detector — deterministic, not a generative guess."
      />
      <CardBody className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">Current</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{regime.regime}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Confidence</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
              {regime.confidenceScore.toFixed(0)}/100
            </p>
            <p className="text-[11px] text-muted-foreground">
              internal rule agreement — not a probability
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t border-border-subtle pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Trend score</dt>
            <dd className="mt-0.5 tabular-nums text-foreground">
              {scores ? `${scores.trendScore.toFixed(0)}/100` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Volatility</dt>
            <dd className="mt-0.5 text-foreground">{volatilityLabel(scores?.volatilityScore)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Momentum</dt>
            <dd className="mt-0.5 text-foreground">{momentumLabel(scores?.momentumScore)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">ADX (14)</dt>
            <dd className="mt-0.5 tabular-nums text-foreground">
              {indicators.adx14?.adx.toFixed(1) ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Price vs VWAP</dt>
            <dd className="mt-0.5 tabular-nums text-foreground">
              {indicators.vwap
                ? `${indicators.vwap.distancePct >= 0 ? "+" : ""}${indicators.vwap.distancePct.toFixed(2)}%`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Duration</dt>
            <dd className="mt-0.5 text-foreground">{duration}</dd>
          </div>
        </dl>

        <div className="border-t border-border-subtle pt-4">
          <p className="mb-2 text-xs text-muted">Rules evaluated</p>
          <ul className="space-y-1 text-xs">
            {regime.rulesEvaluated.map((rule) => (
              <li key={rule.rule} className="flex items-center justify-between gap-2">
                <span className={rule.passed ? "text-buy" : "text-muted-foreground"}>
                  {rule.rule}
                </span>
                <span className="tabular-nums text-muted">
                  {typeof rule.value === "number" ? rule.value.toFixed(1) : String(rule.value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardBody>
    </Card>
  );
}
