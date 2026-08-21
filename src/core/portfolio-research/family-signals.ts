import { carryScoresAsOf, loadAllRateSeries } from "@/core/portfolio-research/carry";
import { MAJOR_INSTRUMENTS } from "@/core/portfolio-research/instruments";
import { buildAudJpyMomentumRegime, buildBasketVolRegime, regimeScaleFactor, type RegimeFilterMode } from "@/core/portfolio-research/regime";
import type { AlignedReturns } from "@/core/portfolio-research/alignment";
import type { FxInstrument } from "@/core/portfolio-research/types";
import type { InstrumentReturnSeries } from "@/core/portfolio-research/leg-returns";

/** Raw (pre-vol-normalization) per-leg conviction at one rebalance date. Sign = direction, magnitude = relative conviction (0 = flat/excluded). */
export type RawSignalMap = Partial<Record<FxInstrument, number>>;

/** Trailing cumulative return of `entries[i]` over the `lookback` periods STRICTLY BEFORE index `i` — never includes `entries[i]` itself, which is the (still-unrealized-at-signal-time) return the signal is trying to predict. This is what makes every signal below causal. */
function trailingCumulativeReturn(entries: readonly { value: number }[], i: number, lookback: number): number | undefined {
  const start = i - lookback;
  if (start < 0) return undefined;
  let cumulative = 1;
  for (let j = start; j < i; j++) cumulative *= 1 + entries[j].value;
  return cumulative - 1;
}

function rankTopBottom(scores: RawSignalMap, n: number): RawSignalMap {
  const entries = Object.entries(scores) as [FxInstrument, number][];
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const out: RawSignalMap = {};
  sorted.slice(0, n).forEach(([inst]) => (out[inst] = 1));
  sorted.slice(-n).forEach(([inst]) => (out[inst] = (out[inst] ?? 0) - 1));
  return out;
}

function zScoreAcrossLegs(scores: RawSignalMap): RawSignalMap {
  const values = Object.values(scores) as number[];
  if (values.length < 2) return scores;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stdev = Math.sqrt(variance);
  const out: RawSignalMap = {};
  for (const [inst, v] of Object.entries(scores)) out[inst as FxInstrument] = stdev > 0 ? (v - mean) / stdev : 0;
  return out;
}

// ---------------------------------------------------------------------------
// Family 1 — FX Factor/Regime Momentum: cross-sectional, majors-vs-USD.
// ---------------------------------------------------------------------------
export function familyOneSignals(aligned: AlignedReturns, lookbackMonths: number, holdMonths: number, topBottomN: number): RawSignalMap[] {
  const n = aligned.monthKeys.length;
  const out: RawSignalMap[] = new Array(n).fill(null).map(() => ({}));
  let lastActiveSignal: RawSignalMap = {};

  for (let i = 0; i < n; i++) {
    const rebalanceNow = i % holdMonths === 0;
    if (!rebalanceNow) {
      out[i] = lastActiveSignal;
      continue;
    }
    const scores: RawSignalMap = {};
    for (const inst of MAJOR_INSTRUMENTS) {
      const entries = aligned.byInstrument[inst];
      if (!entries) continue;
      const trailing = trailingCumulativeReturn(entries, i, lookbackMonths);
      if (trailing !== undefined) scores[inst] = trailing;
    }
    lastActiveSignal = Object.keys(scores).length >= topBottomN * 2 ? rankTopBottom(scores, topBottomN) : {};
    out[i] = lastActiveSignal;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Family 3 — Carry + Crash/Regime Filter.
// ---------------------------------------------------------------------------
export interface CarryFamilyConfig {
  topBottomN: number;
  regimeMode: RegimeFilterMode;
  regimeSource: "BASKET_VOL" | "AUDJPY_MOMENTUM";
  exitThresholdPercentile: number;
}

/**
 * `audJpyReturns` is supplied SEPARATELY from `aligned` because Family
 * 3's trading universe is majors-only (AUDJPY is a cross, not one of
 * the 7 majors) — `aligned.byInstrument.AUDJPY` is therefore always
 * `undefined` when `aligned` is the majors-only grid, which silently
 * made the AUDJPY_MOMENTUM regime source a permanent no-op until this
 * was caught during Block 8.2's own review (F3-F was byte-identical to
 * the unfiltered F3-A baseline — the tell). Callers must pass in
 * AUDJPY's return series from the FULL (crosses-included) alignment.
 */
export function familyThreeSignals(
  aligned: AlignedReturns,
  config: CarryFamilyConfig,
  audJpyReturns?: InstrumentReturnSeries,
): { signals: RawSignalMap[]; regimeApplied: number[] } {
  const rates = loadAllRateSeries();
  const n = aligned.monthKeys.length;
  const signals: RawSignalMap[] = [];
  const regimeApplied: number[] = [];

  const majorSeriesForRegime: InstrumentReturnSeries[] = MAJOR_INSTRUMENTS.map((inst) => ({
    instrument: inst,
    returns: aligned.byInstrument[inst] ?? [],
  }));
  const basketRegime = config.regimeSource === "BASKET_VOL" ? buildBasketVolRegime(majorSeriesForRegime) : undefined;
  const audJpyRegime = config.regimeSource === "AUDJPY_MOMENTUM" && audJpyReturns ? buildAudJpyMomentumRegime(audJpyReturns) : undefined;

  for (let i = 0; i < n; i++) {
    // FRED rates are as-of the SIGNAL date (causal — see carry.ts's own docstring), read at the month the signal fires.
    const asOf = aligned.byInstrument[MAJOR_INSTRUMENTS[0]]?.[i]?.signalMonthEnd;
    const carryScores = asOf ? carryScoresAsOf(rates, asOf) : {};
    let signal = Object.keys(carryScores).length >= config.topBottomN * 2 ? rankTopBottom(carryScores, config.topBottomN) : {};

    const regimeMonthKey = aligned.monthKeys[i];
    const regimeEntry = basketRegime?.byMonth.get(regimeMonthKey) ?? audJpyRegime?.byMonth.get(regimeMonthKey);
    const scale = regimeEntry ? regimeScaleFactor(regimeEntry.percentile, config.regimeMode, config.exitThresholdPercentile) : 1;
    regimeApplied.push(scale);
    if (scale !== 1) signal = Object.fromEntries(Object.entries(signal).map(([k, v]) => [k, v * scale]));

    signals.push(signal);
  }
  return { signals, regimeApplied };
}

// ---------------------------------------------------------------------------
// Family 4 — Diversified Time-Series Trend Following (bilateral, per-instrument sign, no cross-sectional ranking).
// ---------------------------------------------------------------------------
export function familyFourSignals(aligned: AlignedReturns, universe: readonly FxInstrument[], lookbackMonths: number): RawSignalMap[] {
  const n = aligned.monthKeys.length;
  return Array.from({ length: n }, (_, i) => {
    const signal: RawSignalMap = {};
    for (const inst of universe) {
      const entries = aligned.byInstrument[inst];
      if (!entries) continue;
      const trailing = trailingCumulativeReturn(entries, i, lookbackMonths);
      if (trailing !== undefined) signal[inst] = Math.sign(trailing);
    }
    return signal;
  });
}

/** F4-E: blended fast(1m)+slow(12m) signal — average of the two signs, so a leg only gets full conviction when both horizons agree. */
export function familyFourBlendedSignals(aligned: AlignedReturns, universe: readonly FxInstrument[]): RawSignalMap[] {
  const fast = familyFourSignals(aligned, universe, 1);
  const slow = familyFourSignals(aligned, universe, 12);
  return fast.map((fastMonth, i) => {
    const slowMonth = slow[i];
    const combined: RawSignalMap = {};
    for (const inst of universe) {
      const f = fastMonth[inst];
      const s = slowMonth[inst];
      if (f !== undefined && s !== undefined) combined[inst] = (f + s) / 2;
    }
    return combined;
  });
}

// ---------------------------------------------------------------------------
// Family 5 — Multi-Factor FX (carry + trend + value, z-scored per leg, cross-sectionally).
// ---------------------------------------------------------------------------
export interface MultiFactorConfig {
  weights: { carry: number; trend: number; value: number };
  mode: "TOP_BOTTOM_N" | "FULL_UNIVERSE_WEIGHTED";
  topBottomN?: number;
}

/**
 * `valueZByInstrumentMonthKey` comes from
 * `value-ppp.ts`'s `buildValueSignalsByMonthKey` — computed by the
 * caller (from the raw monthly price series, which this module doesn't
 * load itself) and passed in already keyed by the SAME month keys as
 * `aligned.monthKeys`, so Value lines up 1:1 with the Carry/Trend
 * components it's combined with here.
 */
export function familyFiveSignals(
  aligned: AlignedReturns,
  config: MultiFactorConfig,
  valueZByInstrumentMonthKey: Partial<Record<FxInstrument, Map<string, number>>>,
): RawSignalMap[] {
  const rates = loadAllRateSeries();
  const n = aligned.monthKeys.length;
  const trendRaw = familyFourSignals(aligned, MAJOR_INSTRUMENTS, 6); // fixed 6-month trend leg, per §11: components should be simple, not re-tuned per multi-factor variant

  const out: RawSignalMap[] = [];
  for (let i = 0; i < n; i++) {
    const asOf = aligned.byInstrument[MAJOR_INSTRUMENTS[0]]?.[i]?.signalMonthEnd;
    const monthKey = aligned.monthKeys[i];
    const carryScores = asOf ? carryScoresAsOf(rates, asOf) : {};
    const carryZ = zScoreAcrossLegs(carryScores);
    const trendZ = zScoreAcrossLegs(trendRaw[i]);

    const composite: RawSignalMap = {};
    for (const inst of MAJOR_INSTRUMENTS) {
      const c = carryZ[inst] ?? 0;
      const t = trendZ[inst] ?? 0;
      const v = valueZByInstrumentMonthKey[inst]?.get(monthKey) ?? 0;
      composite[inst] = config.weights.carry * c + config.weights.trend * t + config.weights.value * v;
    }
    out.push(config.mode === "TOP_BOTTOM_N" ? rankTopBottom(composite, config.topBottomN ?? 3) : composite);
  }
  return out;
}
