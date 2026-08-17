/**
 * Block 6, forward-testing evidence — computes performance metrics OVER
 * TIME from real paper-forward data (never from the backtest or OOS
 * datasets — see `forward-evidence.ts`'s doc comment on why those stay
 * separate). Built ahead of having enough real forward data to be
 * meaningful, same convention `backtest-vs-paper.ts` already established
 * in this codebase: the pipe exists and is tested with SYNTHETIC
 * fixtures now, so nothing gets improvised later against real numbers.
 *
 * Deliberately reimplements its own small mean/stdev/CAGR/max-drawdown
 * helpers rather than importing `relative-strength.ts`'s private ones —
 * that file is shared byte-for-byte with the audited Block 5 backtest and
 * must not gain new exports/dependents for this unrelated forward-metrics
 * concern. The formulas/conventions below intentionally MATCH that
 * module's (monthly, unannualized Sharpe ratio; peak-to-trough max
 * drawdown) so a human comparing backtest vs. forward numbers is
 * comparing like with like.
 *
 * IMPORTANT — this module computes NUMBERS ONLY. It has no concept of
 * "pass"/"fail"/"validated" and never will: `Rs3mStatus` (see `status.ts`)
 * has no `VALIDATED` state at all, by design. Consuming code must never
 * auto-advance the candidate's status from a threshold computed here.
 */

export interface ForwardEquityPoint {
  /** Calendar month (YYYY-MM) this equity point was observed at. */
  month: string;
  equity: number;
}

export interface ForwardPerformanceInput {
  /** Chronological, one point per observed month of REAL paper trading (from `forward-evidence.ts` EXECUTED rows). */
  strategyEquityCurve: readonly ForwardEquityPoint[];
  /** SPY buy-and-hold equity curve over the SAME months, for excess-return/tracking comparison. */
  benchmarkEquityCurve: readonly ForwardEquityPoint[];
  /** Equal-weight SPY/QQQ/IWM/DIA equity curve over the SAME months. */
  equalWeightEquityCurve: readonly ForwardEquityPoint[];
  /** One realized turnover % per actual rebalance executed. */
  realizedTurnoverPct: readonly number[];
  /** One realized slippage (bps of notional, realized fill vs. the RS3M_CANDIDATE_V1 execution-convention theoretical price) per actual rebalance — see `backtest-vs-paper.ts#reconcileRebalance`'s `executionPriceDeltaPct`, which is this same idea, and is exactly the source a caller should use here. */
  realizedSlippageBps: readonly number[];
  /** Count of rebalance attempts that reached `execute()` but failed to submit (broker rejection, network failure, etc.) — passed in, not re-derived here, since that classification lives in the forward-evidence ledger's `finalState`. */
  executionFailureCount: number;
  /** Count of decision months where the scheduler should have acted (per `scheduling.ts`) but no ledger row exists at all — an outage/scheduler gap, distinct from a correctly-blocked guard failure. Passed in for the same reason as `executionFailureCount`. */
  missedRebalanceCount: number;
}

export interface ForwardPerformanceResult {
  monthsObserved: number;
  cagrPct: number | undefined;
  /** Annualized (monthly stdev × √12), in %. */
  volatilityPct: number | undefined;
  maxDrawdownPct: number;
  /** Monthly, UNANNUALIZED mean/stdev ratio — same simplified convention `relative-strength.ts`'s backtest `sharpeRatio` uses. `undefined` with fewer than 2 months or zero variance. */
  sharpeRatio: number | undefined;
  /** (strategy total return %) − (SPY buy-and-hold total return %) over the same months. */
  excessReturnVsSpyPct: number | undefined;
  /** (strategy total return %) − (equal-weight universe total return %) over the same months. */
  excessReturnVsEwPct: number | undefined;
  /** stdev of (strategy monthly return − SPY monthly return), in % — how consistently forward performance has tracked (or diverged from) the benchmark. */
  trackingDifferencePct: number | undefined;
  realizedTurnoverPctAvg: number | undefined;
  realizedSlippageBpsAvg: number | undefined;
  executionFailureCount: number;
  missedRebalanceCount: number;
  /** Always present, always the same text — a structural reminder next to every computed number, not just in a comment a caller might drop. */
  disclaimer: string;
}

const VALIDATION_DISCLAIMER =
  "These are descriptive forward-performance numbers only. Reaching any particular value here does NOT mark RS3M_CANDIDATE_V1 as VALIDATED — that status does not exist in this codebase's state model (see status.ts) and is never assigned automatically.";

function mean(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function monthlyReturnsFromCurve(curve: readonly ForwardEquityPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].equity;
    if (prev > 0) returns.push((curve[i].equity - prev) / prev);
  }
  return returns;
}

function totalReturnPct(curve: readonly ForwardEquityPoint[]): number | undefined {
  if (curve.length === 0 || curve[0].equity <= 0) return undefined;
  return ((curve[curve.length - 1].equity - curve[0].equity) / curve[0].equity) * 100;
}

function maxDrawdownPctFromCurve(curve: readonly ForwardEquityPoint[]): number {
  let peak = curve.length > 0 ? curve[0].equity : 0;
  let maxDrawdown = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    const drawdown = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  return maxDrawdown;
}

export function computeForwardPerformance(input: ForwardPerformanceInput): ForwardPerformanceResult {
  const { strategyEquityCurve, benchmarkEquityCurve, equalWeightEquityCurve } = input;
  const monthsObserved = strategyEquityCurve.length;
  const monthlyReturns = monthlyReturnsFromCurve(strategyEquityCurve);
  const returnStdev = stdev(monthlyReturns);

  const cagrPct = monthsObserved >= 2 && strategyEquityCurve[0].equity > 0 ? ((strategyEquityCurve[monthsObserved - 1].equity / strategyEquityCurve[0].equity) ** (12 / (monthsObserved - 1)) - 1) * 100 : undefined;

  const strategyTotal = totalReturnPct(strategyEquityCurve);
  const benchmarkTotal = totalReturnPct(benchmarkEquityCurve);
  const equalWeightTotal = totalReturnPct(equalWeightEquityCurve);

  const benchmarkMonthlyReturns = monthlyReturnsFromCurve(benchmarkEquityCurve);
  const trackingDiffs: number[] = [];
  for (let i = 0; i < Math.min(monthlyReturns.length, benchmarkMonthlyReturns.length); i++) {
    trackingDiffs.push((monthlyReturns[i] - benchmarkMonthlyReturns[i]) * 100);
  }

  return {
    monthsObserved,
    cagrPct,
    volatilityPct: monthlyReturns.length >= 2 ? returnStdev * Math.sqrt(12) * 100 : undefined,
    maxDrawdownPct: maxDrawdownPctFromCurve(strategyEquityCurve),
    sharpeRatio: monthlyReturns.length >= 2 && returnStdev > 1e-9 ? mean(monthlyReturns) / returnStdev : undefined,
    excessReturnVsSpyPct: strategyTotal !== undefined && benchmarkTotal !== undefined ? strategyTotal - benchmarkTotal : undefined,
    excessReturnVsEwPct: strategyTotal !== undefined && equalWeightTotal !== undefined ? strategyTotal - equalWeightTotal : undefined,
    trackingDifferencePct: trackingDiffs.length >= 2 ? stdev(trackingDiffs) : undefined,
    realizedTurnoverPctAvg: input.realizedTurnoverPct.length > 0 ? mean(input.realizedTurnoverPct) : undefined,
    realizedSlippageBpsAvg: input.realizedSlippageBps.length > 0 ? mean(input.realizedSlippageBps) : undefined,
    executionFailureCount: input.executionFailureCount,
    missedRebalanceCount: input.missedRebalanceCount,
    disclaimer: VALIDATION_DISCLAIMER,
  };
}
