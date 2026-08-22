/**
 * Block 8.4 §1 — INDEPENDENT reproduction of R3-B, written from
 * `docs/R3B_CANDIDATE_SPEC.md` (the frozen spec), never from reading
 * `src/core/us-index-research/trend-pullback.ts` or `regime.ts`'s own
 * source code. Deliberately duplicates SMA and RSI(Wilder) math with
 * fresh code (both are unambiguous, standard formulas — re-deriving
 * them independently is exactly the point: it catches an INDEXING/
 * WARMUP/OFF-BY-ONE bug in either implementation, not a "different
 * definition of RSI" disagreement). Per this block's explicit rule,
 * this file imports NOTHING from `@/core/us-index-research/{trend-
 * pullback,regime,cost-model,daily-series}` — the only cross-module
 * reuse anywhere in this reproduction is generic, candidate-agnostic
 * portfolio statistics (`@/core/backtesting/research/portfolio-metrics`,
 * used only by the COMPARISON script, never by this file).
 *
 * ONE deliberate, disclosed divergence from the original's exact
 * runtime behavior: the original's regime engine only ever writes a
 * `byDate` reading once BOTH SMA200 AND a realized-vol rolling
 * percentile have warmed up (273 trading days), even though
 * LONG_TERM_TREND mode only READS the SMA200 field — an incidental
 * coupling from computing both regime primitives together, documented
 * in the frozen spec §3. This independent reproduction gates
 * LONG_TERM_TREND purely on SMA200's own 200-day warmup instead (the
 * natural, spec-minimal reading of "regime = price vs SMA200"), which
 * means it can start honoring the regime filter ~73 trading days
 * EARLIER than the original. This is intentional — it doubles as a
 * check on whether that incidental coupling has any economically
 * meaningful multi-decade impact (§1 of the report quantifies it) —
 * and is reported as an EXPLAINED discrepancy, never silently patched
 * over to force an artificial 0-discrepancy match.
 */
export interface R3bBarInput {
  date: string;
  adjClose: number;
}

export interface R3bIndependentConfig {
  smaTrendPeriod: number; // 50
  smaSlopeLookbackDays: number; // 10
  regimeSmaPeriod: number; // 200
  rsiPeriod: number; // 14
  entryRsiThreshold: number; // 40
  exitRsiThreshold: number; // 55
  maxHoldDays: number; // 20
  /** bps charged on EACH leg (entry day and exit day independently) — matches the frozen spec §9's documented (over-)charging convention exactly, so cost isn't a source of divergence from the original. */
  costBpsPerLeg: number;
}

export const R3B_ORIGINAL_CONFIG: R3bIndependentConfig = {
  smaTrendPeriod: 50,
  smaSlopeLookbackDays: 10,
  regimeSmaPeriod: 200,
  rsiPeriod: 14,
  entryRsiThreshold: 40,
  exitRsiThreshold: 55,
  maxHoldDays: 20,
  costBpsPerLeg: 3,
};

/** Simple moving average, causal, trailing-inclusive-of-current window — independently written (no shared code with `@/core/indicators/sma.ts`). */
function independentSma(closes: readonly number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(closes.length).fill(undefined);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Wilder-smoothed RSI, causal — independently written (no shared code with `@/core/indicators/rsi.ts`), standard textbook formula re-derived from scratch. */
function independentRsi(closes: readonly number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(closes.length).fill(undefined);
  if (closes.length < period + 1) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gainSum += delta;
    else lossSum += -delta;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFromAverages(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return out;
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface R3bDailyResult {
  date: string;
  inPosition: boolean;
  grossReturn: number;
  costDrag: number;
  netReturn: number;
}

export interface R3bTrade {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  exitReason: "RSI_TARGET" | "TREND_BREAK" | "MAX_HOLD";
  holdDays: number;
}

export interface R3bReproductionResult {
  daily: R3bDailyResult[];
  trades: R3bTrade[];
}

/** Freshly-written state machine from the frozen spec, not from reading `trend-pullback.ts`'s code. */
export function runR3bIndependentReproduction(bars: readonly R3bBarInput[], config: R3bIndependentConfig): R3bReproductionResult {
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const closes = sorted.map((b) => b.adjClose);

  const smaTrend = independentSma(closes, config.smaTrendPeriod);
  const smaRegime = independentSma(closes, config.regimeSmaPeriod);
  const rsi = independentRsi(closes, config.rsiPeriod);

  const trendRising: (boolean | undefined)[] = closes.map((_, i) => {
    const now = smaTrend[i];
    const past = i >= config.smaSlopeLookbackDays ? smaTrend[i - config.smaSlopeLookbackDays] : undefined;
    return now !== undefined && past !== undefined ? now > past : undefined;
  });

  // Deliberate divergence from the original's incidental vol-percentile-coupled warmup (see module docstring) — regime gates purely on SMA200's own warmup.
  const regimeOk: boolean[] = closes.map((_, i) => {
    const sma = smaRegime[i];
    if (sma === undefined) return true; // same "no reading yet -> pass" convention as the original's regimePasses(), applied to this module's OWN (SMA200-only) warmup instead.
    return closes[i] > sma;
  });

  const daily: R3bDailyResult[] = [];
  const trades: R3bTrade[] = [];
  let inPosition = false;
  let daysHeld = 0;
  let previousFlag = 0;
  let entryDate = "";
  let entryPrice = 0;

  for (let i = 1; i < sorted.length; i++) {
    const priorIdx = i - 1;
    const dailyReturn = closes[i] / closes[priorIdx] - 1;

    if (inPosition) {
      daysHeld += 1;
      const priorRsi = rsi[priorIdx];
      const exitOnRsi = priorRsi !== undefined && priorRsi >= config.exitRsiThreshold;
      const exitOnTrendBreak = trendRising[priorIdx] === false;
      const exitOnMaxHold = daysHeld >= config.maxHoldDays;
      if (exitOnRsi || exitOnTrendBreak || exitOnMaxHold) {
        inPosition = false;
        trades.push({
          entryDate,
          exitDate: sorted[i].date,
          entryPrice,
          exitPrice: closes[i],
          exitReason: exitOnRsi ? "RSI_TARGET" : exitOnTrendBreak ? "TREND_BREAK" : "MAX_HOLD",
          holdDays: daysHeld,
        });
        daysHeld = 0;
      }
    } else {
      const priorRsi = rsi[priorIdx];
      const priorPriorRsi = priorIdx >= 1 ? rsi[priorIdx - 1] : undefined;
      const wasOversold = priorPriorRsi !== undefined && priorPriorRsi < config.entryRsiThreshold;
      const resumedNow = priorRsi !== undefined && priorRsi >= config.entryRsiThreshold;
      if (wasOversold && resumedNow && trendRising[priorIdx] === true && regimeOk[priorIdx]) {
        inPosition = true;
        daysHeld = 0;
        entryDate = sorted[i].date;
        entryPrice = closes[i];
      }
    }

    const flag = inPosition ? 1 : 0;
    const turnover = Math.abs(flag - previousFlag);
    const costDrag = turnover * (config.costBpsPerLeg / 10_000);
    const grossReturn = flag * dailyReturn;
    daily.push({ date: sorted[i].date, inPosition, grossReturn, costDrag, netReturn: grossReturn - costDrag });
    previousFlag = flag;
  }

  return { daily, trades };
}
