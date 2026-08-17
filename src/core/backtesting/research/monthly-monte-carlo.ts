/**
 * Block 6, Fase 14 — extended Monte Carlo over a monthly return series.
 * Promoted from the inline `runMonthlyMonteCarlo`/`mulberry32`/`percentiles`
 * helpers in `scripts/research/run-block5-relative-strength.ts` (Block 5),
 * extended per the Block 6 spec: 10,000 simulations by default, a wider
 * percentile set, terminal-loss and underperformance probabilities, and a
 * block-bootstrap variant alongside the original single-month reshuffle.
 *
 * Both variants answer the same risk question as the trade-based Monte
 * Carlo in `monte-carlo.ts`: "how much could sequencing alone have
 * hurt/helped," never a profitability forecast. The single-month reshuffle
 * (`method: "RESHUFFLE"`) draws each simulated month independently with
 * replacement, which destroys any month-to-month autocorrelation/momentum
 * persistence in the real series — a recognized, documented limitation,
 * not a hidden one. The block-bootstrap variant (`method: "BLOCK_BOOTSTRAP"`)
 * resamples contiguous runs of `blockSizeMonths` real months at a time,
 * partially preserving that autocorrelation.
 */

export interface MonteCarloEndingEquityPercentiles {
  p1: number;
  p5: number;
  p50: number;
  p95: number;
}

export interface MonteCarloDrawdownPercentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface MonthlyMonteCarloResult {
  numSimulations: number;
  seed: number;
  method: "RESHUFFLE" | "BLOCK_BOOTSTRAP";
  blockSizeMonths: number | undefined;
  monthsPerSimulation: number;
  endingEquity: MonteCarloEndingEquityPercentiles;
  maxDrawdownPct: MonteCarloDrawdownPercentiles;
  /** Share of simulations ending with equity below 1 (a net loss over the simulated horizon). */
  probabilityOfTerminalLossPct: number;
  /** Share of simulations whose ending equity is below the REAL (non-simulated) benchmark's compounded terminal equity over the same number of months — `undefined` when no benchmark series was supplied. */
  probabilityOfUnderperformingBenchmarkPct: number | undefined;
  /** Same as above, against the equal-weight series — `undefined` when none was supplied. */
  probabilityOfUnderperformingEqualWeightPct: number | undefined;
}

export interface MonthlyMonteCarloOptions {
  numSimulations?: number;
  seed?: number;
  /** Real (non-simulated) monthly returns of a comparison benchmark, same period as `monthlyReturnsPct` — used only to compute `probabilityOfUnderperformingBenchmarkPct`, never resampled itself. */
  benchmarkMonthlyReturnsPct?: readonly number[];
  /** Real (non-simulated) monthly returns of an equal-weight comparison, same period as `monthlyReturnsPct` — used only to compute `probabilityOfUnderperformingEqualWeightPct`. */
  equalWeightMonthlyReturnsPct?: readonly number[];
}

export interface BlockBootstrapOptions extends MonthlyMonteCarloOptions {
  blockSizeMonths?: number;
}

const DEFAULT_NUM_SIMULATIONS = 10_000;
const DEFAULT_SEED = 42;
const DEFAULT_BLOCK_SIZE_MONTHS = 4;

function mulberry32(seed: number): () => number {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentileOf(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function compoundTerminalEquity(monthlyReturnsPct: readonly number[]): number {
  return monthlyReturnsPct.reduce((equity, r) => equity * (1 + r / 100), 1);
}

function simulateOnePath(monthlyReturnSequencePct: readonly number[]): { endingEquity: number; maxDrawdownPct: number } {
  let equity = 1;
  let peak = 1;
  let maxDrawdownPct = 0;
  for (const r of monthlyReturnSequencePct) {
    equity *= 1 + r / 100;
    peak = Math.max(peak, equity);
    maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? ((peak - equity) / peak) * 100 : 0);
  }
  return { endingEquity: equity, maxDrawdownPct };
}

function buildResult(
  endingEquities: readonly number[],
  maxDrawdowns: readonly number[],
  numSimulations: number,
  seed: number,
  method: "RESHUFFLE" | "BLOCK_BOOTSTRAP",
  blockSizeMonths: number | undefined,
  monthsPerSimulation: number,
  benchmarkMonthlyReturnsPct: readonly number[] | undefined,
  equalWeightMonthlyReturnsPct: readonly number[] | undefined,
): MonthlyMonteCarloResult {
  const sortedEquities = [...endingEquities].sort((a, b) => a - b);
  const sortedDrawdowns = [...maxDrawdowns].sort((a, b) => a - b);
  const lossCount = endingEquities.filter((e) => e < 1).length;

  const benchmarkTerminalEquity = benchmarkMonthlyReturnsPct !== undefined ? compoundTerminalEquity(benchmarkMonthlyReturnsPct) : undefined;
  const equalWeightTerminalEquity = equalWeightMonthlyReturnsPct !== undefined ? compoundTerminalEquity(equalWeightMonthlyReturnsPct) : undefined;

  return {
    numSimulations,
    seed,
    method,
    blockSizeMonths,
    monthsPerSimulation,
    endingEquity: {
      p1: percentileOf(sortedEquities, 1),
      p5: percentileOf(sortedEquities, 5),
      p50: percentileOf(sortedEquities, 50),
      p95: percentileOf(sortedEquities, 95),
    },
    maxDrawdownPct: {
      p50: percentileOf(sortedDrawdowns, 50),
      p75: percentileOf(sortedDrawdowns, 75),
      p90: percentileOf(sortedDrawdowns, 90),
      p95: percentileOf(sortedDrawdowns, 95),
      p99: percentileOf(sortedDrawdowns, 99),
    },
    probabilityOfTerminalLossPct: endingEquities.length > 0 ? (lossCount / endingEquities.length) * 100 : 0,
    probabilityOfUnderperformingBenchmarkPct:
      benchmarkTerminalEquity !== undefined && endingEquities.length > 0
        ? (endingEquities.filter((e) => e < benchmarkTerminalEquity).length / endingEquities.length) * 100
        : undefined,
    probabilityOfUnderperformingEqualWeightPct:
      equalWeightTerminalEquity !== undefined && endingEquities.length > 0
        ? (endingEquities.filter((e) => e < equalWeightTerminalEquity).length / endingEquities.length) * 100
        : undefined,
  };
}

const EMPTY_RESULT_TEMPLATE = { endingEquity: { p1: 1, p5: 1, p50: 1, p95: 1 }, maxDrawdownPct: { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 } };

/** Resamples each simulated month INDEPENDENTLY with replacement from the real monthly return series (single-month reshuffle — destroys autocorrelation, see module docs). */
export function runMonthlyMonteCarlo(monthlyReturnsPct: readonly number[], options: MonthlyMonteCarloOptions = {}): MonthlyMonteCarloResult {
  const numSimulations = options.numSimulations ?? DEFAULT_NUM_SIMULATIONS;
  const seed = options.seed ?? DEFAULT_SEED;

  if (monthlyReturnsPct.length === 0) {
    return {
      numSimulations,
      seed,
      method: "RESHUFFLE",
      blockSizeMonths: undefined,
      monthsPerSimulation: 0,
      probabilityOfTerminalLossPct: 0,
      probabilityOfUnderperformingBenchmarkPct: undefined,
      probabilityOfUnderperformingEqualWeightPct: undefined,
      ...EMPTY_RESULT_TEMPLATE,
    };
  }

  const rng = mulberry32(seed);
  const endingEquities: number[] = [];
  const maxDrawdowns: number[] = [];

  for (let sim = 0; sim < numSimulations; sim++) {
    const sequence: number[] = [];
    for (let t = 0; t < monthlyReturnsPct.length; t++) {
      sequence.push(monthlyReturnsPct[Math.floor(rng() * monthlyReturnsPct.length)]);
    }
    const { endingEquity, maxDrawdownPct } = simulateOnePath(sequence);
    endingEquities.push(endingEquity);
    maxDrawdowns.push(maxDrawdownPct);
  }

  return buildResult(
    endingEquities,
    maxDrawdowns,
    numSimulations,
    seed,
    "RESHUFFLE",
    undefined,
    monthlyReturnsPct.length,
    options.benchmarkMonthlyReturnsPct,
    options.equalWeightMonthlyReturnsPct,
  );
}

/**
 * Resamples CONTIGUOUS blocks of `blockSizeMonths` real months at a time
 * (with replacement, blocks may overlap in source position and repeat),
 * concatenated until reaching the original series length (the final block
 * is truncated if it would overshoot) — partially preserves
 * month-to-month autocorrelation that the single-month reshuffle destroys.
 */
export function runMonthlyMonteCarloBlockBootstrap(monthlyReturnsPct: readonly number[], options: BlockBootstrapOptions = {}): MonthlyMonteCarloResult {
  const numSimulations = options.numSimulations ?? DEFAULT_NUM_SIMULATIONS;
  const seed = options.seed ?? DEFAULT_SEED;
  const blockSizeMonths = Math.max(1, options.blockSizeMonths ?? DEFAULT_BLOCK_SIZE_MONTHS);

  if (monthlyReturnsPct.length === 0) {
    return {
      numSimulations,
      seed,
      method: "BLOCK_BOOTSTRAP",
      blockSizeMonths,
      monthsPerSimulation: 0,
      probabilityOfTerminalLossPct: 0,
      probabilityOfUnderperformingBenchmarkPct: undefined,
      probabilityOfUnderperformingEqualWeightPct: undefined,
      ...EMPTY_RESULT_TEMPLATE,
    };
  }

  const n = monthlyReturnsPct.length;
  const effectiveBlockSize = Math.min(blockSizeMonths, n);
  const rng = mulberry32(seed);
  const endingEquities: number[] = [];
  const maxDrawdowns: number[] = [];

  for (let sim = 0; sim < numSimulations; sim++) {
    const sequence: number[] = [];
    while (sequence.length < n) {
      const blockStart = Math.floor(rng() * (n - effectiveBlockSize + 1));
      for (let offset = 0; offset < effectiveBlockSize && sequence.length < n; offset++) {
        sequence.push(monthlyReturnsPct[blockStart + offset]);
      }
    }
    const { endingEquity, maxDrawdownPct } = simulateOnePath(sequence);
    endingEquities.push(endingEquity);
    maxDrawdowns.push(maxDrawdownPct);
  }

  return buildResult(
    endingEquities,
    maxDrawdowns,
    numSimulations,
    seed,
    "BLOCK_BOOTSTRAP",
    blockSizeMonths,
    n,
    options.benchmarkMonthlyReturnsPct,
    options.equalWeightMonthlyReturnsPct,
  );
}
