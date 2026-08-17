import type { Candle } from "@/core/market-data/types";
import type { BacktestConfig, BacktestingEngine, BacktestRun, WalkForwardConfig } from "@/core/backtesting/types";

export interface WalkForwardWindow {
  windowIndex: number;
  train: Candle[];
  validation: Candle[];
  forward: Candle[];
}

/**
 * Generates train/validation/forward windows sliding forward by
 * `stepBars` bars, bar-count-based (not date-based) so window sizing is
 * timeframe-agnostic. Stops once a full window no longer fits in the
 * remaining candles — a partial trailing window is never produced,
 * since a shortened forward-test period would be misleading.
 */
export function buildWalkForwardWindows(
  candles: readonly Candle[],
  config: WalkForwardConfig,
): WalkForwardWindow[] {
  const windowSize = config.trainBars + config.validationBars + config.forwardBars;
  const windows: WalkForwardWindow[] = [];

  let start = 0;
  let windowIndex = 0;
  while (start + windowSize <= candles.length) {
    const trainEnd = start + config.trainBars;
    const validationEnd = trainEnd + config.validationBars;
    const forwardEnd = start + windowSize;

    windows.push({
      windowIndex,
      train: candles.slice(start, trainEnd) as Candle[],
      validation: candles.slice(trainEnd, validationEnd) as Candle[],
      forward: candles.slice(validationEnd, forwardEnd) as Candle[],
    });

    start += config.stepBars;
    windowIndex += 1;
  }

  return windows;
}

export interface WalkForwardWindowResult {
  windowIndex: number;
  train: BacktestRun;
  validation: BacktestRun;
  forward: BacktestRun;
}

function runOnPhase(engine: BacktestingEngine, config: BacktestConfig, candles: Candle[]): BacktestRun {
  return engine.run(
    {
      ...config,
      dateFrom: candles[0]?.timestamp ?? config.dateFrom,
      dateTo: candles[candles.length - 1]?.timestamp ?? config.dateTo,
    },
    candles,
  );
}

/**
 * Runs the SAME base config (never touching parameters between windows
 * — evaluating base parameters, not optimizing them, per this block's
 * explicit scope) against each phase of each window. `train`/`validation`
 * results are informational; only `forward` results are proper
 * out-of-sample tests, since forward is the one phase a train/validation
 * process — even one done purely by eye, never mind automated tuning —
 * could never have influenced.
 */
export function runWalkForwardWindows(
  engine: BacktestingEngine,
  config: BacktestConfig,
  windows: readonly WalkForwardWindow[],
): WalkForwardWindowResult[] {
  return windows.map((window) => ({
    windowIndex: window.windowIndex,
    train: runOnPhase(engine, config, window.train),
    validation: runOnPhase(engine, config, window.validation),
    forward: runOnPhase(engine, config, window.forward),
  }));
}
