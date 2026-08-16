"use client";

import { useState, type FormEvent } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataUnavailableNotice } from "@/components/dashboard/DataUnavailableNotice";
import { MetricsSummaryGrid } from "@/components/backtesting/MetricsSummaryGrid";
import { EquityCurveChart } from "@/components/backtesting/EquityCurveChart";
import { DrawdownCurveChart } from "@/components/backtesting/DrawdownCurveChart";
import { CumulativeRChart } from "@/components/backtesting/CumulativeRChart";
import { PerformanceBreakdownTable, type PerformanceBreakdownEntry } from "@/components/backtesting/PerformanceBreakdownTable";
import { TradeAuditTable } from "@/components/backtesting/TradeAuditTable";
import { BuyHoldComparison } from "@/components/backtesting/BuyHoldComparison";
import type { BacktestMetrics, BacktestRun } from "@/core/backtesting/types";
import type { Timeframe } from "@/core/shared/types";

export interface BacktestWorkbenchStrategyOption {
  id: string;
  name: string;
}

interface BacktestWorkbenchProps {
  strategies: BacktestWorkbenchStrategyOption[];
}

const TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m", "1h"];

interface FormState {
  strategyId: string;
  timeframe: Timeframe;
  dateFrom: string;
  dateTo: string;
  initialCapital: string;
  riskPerTradePct: string;
  costPreset: "ZERO" | "REALISTIC" | "CUSTOM";
  commissionPerFill: string;
  slippagePct: string;
  halfSpread: string;
  sameCandlePolicy: "CONSERVATIVE" | "OPTIMISTIC";
}

function defaultDateRange(): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 6);
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10) };
}

function regimeEntries(metrics: BacktestMetrics): PerformanceBreakdownEntry[] {
  return Object.entries(metrics.performanceByRegime).map(([label, m]) => ({ label, metrics: m! }));
}
function hourEntries(metrics: BacktestMetrics): PerformanceBreakdownEntry[] {
  return Object.entries(metrics.performanceByHour)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([label, m]) => ({ label: `${label}:00`, metrics: m }));
}
export function BacktestWorkbench({ strategies }: BacktestWorkbenchProps) {
  const initialRange = defaultDateRange();
  const [form, setForm] = useState<FormState>({
    strategyId: strategies[0]?.id ?? "",
    timeframe: "15m",
    dateFrom: initialRange.dateFrom,
    dateTo: initialRange.dateTo,
    initialCapital: "10000",
    riskPerTradePct: "0.5",
    costPreset: "REALISTIC",
    commissionPerFill: "0",
    slippagePct: "0.0005",
    halfSpread: "0.005",
    sameCandlePolicy: "CONSERVATIVE",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<{ run: BacktestRun; baseline?: BacktestMetrics } | undefined>();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);
    setResult(undefined);

    try {
      const response = await fetch("/api/backtesting/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategyId: form.strategyId,
          timeframe: form.timeframe,
          dateFrom: new Date(form.dateFrom).toISOString(),
          dateTo: new Date(form.dateTo).toISOString(),
          initialCapital: Number(form.initialCapital),
          riskPerTradePct: Number(form.riskPerTradePct),
          costPreset: form.costPreset,
          commissionPerFill: Number(form.commissionPerFill),
          slippagePct: Number(form.slippagePct),
          halfSpread: Number(form.halfSpread),
          sameCandlePolicy: form.sameCandlePolicy,
        }),
      });

      const body = (await response.json()) as {
        available?: boolean;
        run?: BacktestRun;
        baseline?: BacktestMetrics;
        reason?: string;
        error?: string;
      };
      if (!response.ok || !body.available || !body.run) {
        setError(body.reason ?? body.error ?? `Request failed (${response.status}).`);
        return;
      }
      setResult({ run: body.run, baseline: body.baseline });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const metrics = result?.run.metrics;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Configure backtest"
          description="Single strategy, event-driven simulation over real historical candles. No parameter is ever auto-tuned."
        />
        <CardBody>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Strategy
              <select
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={form.strategyId}
                onChange={(e) => setForm({ ...form, strategyId: e.target.value })}
              >
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              Timeframe
              <select
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={form.timeframe}
                onChange={(e) => setForm({ ...form, timeframe: e.target.value as Timeframe })}
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              Start date
              <input
                type="date"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={form.dateFrom}
                onChange={(e) => setForm({ ...form, dateFrom: e.target.value })}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              End date
              <input
                type="date"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={form.dateTo}
                onChange={(e) => setForm({ ...form, dateTo: e.target.value })}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              Initial capital ($)
              <input
                type="number"
                min={1}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={form.initialCapital}
                onChange={(e) => setForm({ ...form, initialCapital: e.target.value })}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              Risk per trade (%)
              <input
                type="number"
                min={0.01}
                step={0.01}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={form.riskPerTradePct}
                onChange={(e) => setForm({ ...form, riskPerTradePct: e.target.value })}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              Execution costs
              <select
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={form.costPreset}
                onChange={(e) => setForm({ ...form, costPreset: e.target.value as FormState["costPreset"] })}
              >
                <option value="ZERO">Zero-cost baseline</option>
                <option value="REALISTIC">Realistic (5bps slippage + spread)</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              Same-candle ambiguity
              <select
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={form.sameCandlePolicy}
                onChange={(e) =>
                  setForm({ ...form, sameCandlePolicy: e.target.value as FormState["sameCandlePolicy"] })
                }
              >
                <option value="CONSERVATIVE">Conservative (assume unfavorable)</option>
                <option value="OPTIMISTIC">Optimistic (assume favorable)</option>
              </select>
            </label>

            {form.costPreset === "CUSTOM" ? (
              <>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Commission / fill ($)
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={form.commissionPerFill}
                    onChange={(e) => setForm({ ...form, commissionPerFill: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Slippage (fraction)
                  <input
                    type="number"
                    min={0}
                    step={0.0001}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={form.slippagePct}
                    onChange={(e) => setForm({ ...form, slippagePct: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Half spread ($)
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    value={form.halfSpread}
                    onChange={(e) => setForm({ ...form, halfSpread: e.target.value })}
                  />
                </label>
              </>
            ) : null}

            <div className="col-span-full flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={loading || !form.strategyId}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {loading ? "Running…" : "Run backtest"}
              </button>
              <span className="text-xs text-muted-foreground">
                Market: SP500 — the only market this system currently supports.
              </span>
            </div>
          </form>
        </CardBody>
      </Card>

      {error ? <DataUnavailableNotice reason={error} /> : null}

      {result && result.run.status === "FAILED" ? (
        <DataUnavailableNotice reason={result.run.errorMessage ?? "Backtest run failed."} />
      ) : null}

      {result && result.run.status === "COMPLETED" && metrics ? (
        <div className="space-y-6">
          <MetricsSummaryGrid metrics={metrics} />

          {result.baseline ? (
            <BuyHoldComparison strategyMetrics={metrics} baseline={result.baseline} />
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <EquityCurveChart trades={result.run.trades} initialCapital={result.run.config.initialCapital} />
            <DrawdownCurveChart trades={result.run.trades} initialCapital={result.run.config.initialCapital} />
            <CumulativeRChart trades={result.run.trades} />
          </div>

          <PerformanceBreakdownTable
            title="Performance by market regime"
            description="Every regime the run touched — never filtered to the good ones."
            entries={regimeEntries(metrics)}
          />

          <PerformanceBreakdownTable
            title="Performance by hour of day"
            description="Entry hour, exchange-local time."
            entries={hourEntries(metrics)}
          />

          <TradeAuditTable trades={result.run.trades} />
        </div>
      ) : null}
    </div>
  );
}
