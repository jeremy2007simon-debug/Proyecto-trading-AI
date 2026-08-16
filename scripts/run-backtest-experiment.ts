/**
 * Standalone real-data backtest experiment (Block 4, point 29).
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/run-backtest-experiment.ts
 *
 * (The `--conditions=react-server` flag is required only because
 * `alpaca.adapter.ts`/`provider-factory.ts` import the `server-only`
 * marker package, which throws unless the "react-server" export
 * condition is active — normally supplied by Next.js's bundler. This
 * script is a legitimate non-Next.js caller of those same server-only
 * modules, so it supplies the condition itself via a Node flag instead
 * of weakening the guard in the source files.)
 *
 * For each of the 5 registered strategies, at that strategy's own
 * `supportedTimeframes[0]` (each strategy currently supports exactly one
 * hardcoded timeframe — a Block 3 decision this script does not change),
 * this script:
 *
 *   1. Fetches real SPY historical candles directly from Alpaca
 *      (`feed=sip`, see `alpaca.adapter.ts`) — never synthetic data.
 *   2. Reports the exact dataset BEFORE running anything: start/end
 *      timestamp, candle count, and the full Data Quality Engine report
 *      (including gaps detected). A Data Quality FAIL stops that
 *      strategy's simulation entirely — it is never run on data flagged
 *      as untrustworthy.
 *   3. Runs the real event-driven engine over the full period at both
 *      the zero-cost baseline and the realistic-cost scenario.
 *   4. Splits the same candles chronologically 60/20/20 (train /
 *      validation / out-of-sample) and runs each split independently.
 *   5. Builds walk-forward windows (sized from the actual sample) and
 *      runs train/validation/forward on each, with the SAME base
 *      parameters throughout — no optimization, no parameter search.
 *   6. Runs a Monte Carlo bootstrap over the full-period realistic-cost
 *      trade sequence.
 *   7. Computes the Buy & Hold baseline over the identical period.
 *
 * Every strategy's raw result — including a strategy that loses money,
 * or one whose data quality fails, or one with too few trades to draw
 * any conclusion from — is written to `.backtest-results/<id>.json`
 * unmodified. Nothing here tunes parameters, retries with different
 * settings, or omits an unfavorable result.
 */
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createRuleBasedDataQualityEngine } from "@/core/data-quality/rule-based-data-quality-engine";
import type { DataQualityReport } from "@/core/data-quality/types";
import { toMarketDataValidFlag } from "@/core/data-quality/types";
import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import type { Candle } from "@/core/market-data/types";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import {
  BacktestSimulationError,
  DEFAULT_SAME_CANDLE_POLICY,
  REALISTIC_COST_SCENARIO,
  ZERO_COST_BASELINE,
  type BacktestConfig,
  type BacktestRun,
  type WalkForwardConfig,
} from "@/core/backtesting/types";
import { computeBuyAndHoldBaseline } from "@/core/backtesting/baseline-buy-and-hold";
import { describeDatasetSplit, splitCandlesChronologically } from "@/core/backtesting/dataset-split";
import { createEventDrivenBacktestEngine } from "@/core/backtesting/event-driven-simulator";
import { runMonteCarloSimulation } from "@/core/backtesting/monte-carlo";
import { buildWalkForwardWindows, runWalkForwardWindows } from "@/core/backtesting/walk-forward";
import { DEFAULT_RISK_RULES } from "@/core/risk-engine/types";
import { getDefaultStrategyManager } from "@/core/strategy-manager/registry";
import { TIMEFRAME_MINUTES } from "@/core/shared/timeframe";

// --- .env.local loader (this script runs outside Next.js, which is the
// only thing that normally loads it) — no new dependency, just a
// minimal KEY=VALUE parser that never overrides an already-set var. ---
function loadDotEnvLocal(): void {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnvLocal();

// --- curl-based fetch shim for this sandbox only ---
//
// This development sandbox routes outbound HTTPS through a local
// forward proxy ($HTTPS_PROXY); `curl` honors that env var natively,
// but Node's built-in `fetch` (undici) does not, and neither
// `undici.setGlobalDispatcher` nor an explicit `dispatcher: new
// ProxyAgent(...)` reached the built-in fetch in this Node build during
// testing. Rather than change `alpaca.adapter.ts`'s plain `fetch()`
// calls (production Next.js deployments do not sit behind this proxy
// and need no such shim), this script replaces `globalThis.fetch` with
// a `curl`-backed implementation for the lifetime of this one-off
// process only. `alpaca.adapter.ts` only ever reads `response.status`
// and calls `response.json()` — never headers — so a status+body-only
// `Response` is a complete, honest substitute here.
const execFileAsync = promisify(execFile);

async function curlFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const headerArgs = Object.entries(headers).flatMap(([key, value]) => ["-H", `${key}: ${value}`]);

  const dir = mkdtempSync(join(tmpdir(), "curl-fetch-"));
  const bodyFile = join(dir, "body");
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-sS", "-o", bodyFile, "-w", "%{http_code}", url, ...headerArgs],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    const status = Number(stdout.trim());
    const body = readFileSync(bodyFile, "utf8");
    return new Response(body, { status: Number.isFinite(status) && status > 0 ? status : 599 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
globalThis.fetch = curlFetch as typeof fetch;

const OUTPUT_DIR = join(process.cwd(), ".backtest-results");
const EXPERIMENT_YEARS = Number(process.env.EXPERIMENT_YEARS ?? "2");
const INITIAL_CAPITAL = 10_000;
const RISK_PER_TRADE_PCT = DEFAULT_RISK_RULES.maxRiskPerTradePct; // 0.5%, exactly the user's spec
const RTH_MINUTES_PER_DAY = 390; // 6.5h regular trading hours

interface StrategyExperimentSummary {
  strategyId: string;
  strategyName: string;
  timeframe: string;
  status: "COMPLETED" | "DATA_QUALITY_FAIL" | "SIMULATION_FAILED" | "PROVIDER_UNAVAILABLE";
  reason?: string;
  dataset?: {
    from: string;
    to: string;
    candleCount: number;
    gapsDetected: number;
    dataQualityStatus: DataQualityReport["status"];
  };
  fullPeriodRealisticCost?: BacktestRun["metrics"];
  fullPeriodZeroCost?: BacktestRun["metrics"];
  outOfSample?: BacktestRun["metrics"];
  walkForwardWindowCount?: number;
  buyAndHold?: BacktestRun["metrics"];
}

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...args);
}

function walkForwardConfigFor(timeframe: BacktestConfig["timeframe"], totalCandles: number): WalkForwardConfig | undefined {
  const barsPerDay = Math.max(1, Math.round(RTH_MINUTES_PER_DAY / TIMEFRAME_MINUTES[timeframe]));
  const trainBars = barsPerDay * 126; // ~6 months of trading days
  const validationBars = barsPerDay * 21; // ~1 month
  const forwardBars = barsPerDay * 21; // ~1 month
  const stepBars = forwardBars; // non-overlapping forward windows

  if (totalCandles < trainBars + validationBars + forwardBars) return undefined;
  return { trainBars, validationBars, forwardBars, stepBars };
}

function baseConfig(
  strategyId: string,
  timeframe: BacktestConfig["timeframe"],
  candles: readonly Candle[],
): Omit<BacktestConfig, "costs"> {
  return {
    name: `experiment-${strategyId}-${timeframe}`,
    market: "SP500",
    timeframe,
    mode: "SINGLE_STRATEGY",
    strategyIds: [strategyId],
    dateFrom: candles[0]?.timestamp ?? new Date().toISOString(),
    dateTo: candles[candles.length - 1]?.timestamp ?? new Date().toISOString(),
    initialCapital: INITIAL_CAPITAL,
    riskPerTradePct: RISK_PER_TRADE_PCT,
    commission: 0,
    slippage: 0,
    sameCandlePolicy: DEFAULT_SAME_CANDLE_POLICY,
  };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const providerResult = createMarketDataProvider();
  if (!providerResult.ok) {
    log(`[experiment] Market data provider unavailable: ${providerResult.error.message}`);
    process.exitCode = 1;
    return;
  }
  const provider = providerResult.value;
  const manager = getDefaultStrategyManager();
  const engine = createEventDrivenBacktestEngine(manager);
  const dataQualityEngine = createRuleBasedDataQualityEngine();
  const calendar = createNyseCalendar("SP500");

  const registrations = manager.listRegistrations("SP500");
  const summaries: StrategyExperimentSummary[] = [];

  for (const registration of registrations) {
    const strategy = registration.strategy;
    const strategyId = strategy.id;
    const timeframe = strategy.supportedTimeframes[0];

    log(`\n=== ${strategy.name} (${strategyId}) — timeframe ${timeframe} ===`);

    const to = new Date();
    // Millisecond-based subtraction, not `setFullYear(getFullYear() - years)`
    // — that call truncates a fractional `EXPERIMENT_YEARS` to an integer
    // year offset (e.g. 0.05 silently became 0, moving `from` by a whole
    // year instead of ~18 days), which would silently ignore any
    // non-integer override of this env var.
    const from = new Date(to.getTime() - EXPERIMENT_YEARS * 365.25 * 24 * 60 * 60 * 1000);

    // `to` is deliberately omitted, not set to "now": this Alpaca account's
    // `sip` feed enforces a ~15-minute recency embargo (confirmed
    // empirically — an explicit `end` inside that window returns HTTP 403
    // "subscription does not permit querying recent SIP data"). Per
    // `MarketDataRequest.to`'s own contract ("omit to request up to
    // latest"), leaving it unset lets Alpaca return everything it is
    // actually willing to serve, instead of guessing a safety margin.
    const fetchResult = await provider.getHistoricalCandles({
      market: "SP500",
      timeframe,
      from: from.toISOString(),
    });

    if (!fetchResult.ok) {
      log(`[experiment] Fetch failed: ${fetchResult.error.code} — ${fetchResult.error.message}`);
      summaries.push({
        strategyId,
        strategyName: strategy.name,
        timeframe,
        status: "PROVIDER_UNAVAILABLE",
        reason: `${fetchResult.error.code}: ${fetchResult.error.message}`,
      });
      continue;
    }

    const candles = fetchResult.value.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    log(
      `[dataset] requested ${from.toISOString()} .. ${to.toISOString()} — received ${candles.length} candles, ` +
        `actual range ${candles[0]?.timestamp} .. ${candles[candles.length - 1]?.timestamp}`,
    );

    const dataQuality = dataQualityEngine.evaluate(candles, {
      market: "SP500",
      timeframe,
      calendar,
      now: new Date(candles[candles.length - 1]?.timestamp ?? to.toISOString()),
    });

    log(
      `[data-quality] status=${dataQuality.status} gaps=${dataQuality.gapsDetected} duplicates=${dataQuality.duplicatesDetected}`,
    );
    for (const rule of dataQuality.rulesEvaluated) {
      log(`  - ${rule.rule}: ${rule.passed ? "PASS" : "FAIL"} — ${rule.detail}`);
    }

    const datasetSummary = {
      from: candles[0]?.timestamp ?? "",
      to: candles[candles.length - 1]?.timestamp ?? "",
      candleCount: candles.length,
      gapsDetected: dataQuality.gapsDetected,
      dataQualityStatus: dataQuality.status,
    };

    if (!toMarketDataValidFlag(dataQuality)) {
      log(`[experiment] Data quality FAILED for ${strategyId}/${timeframe} — this strategy is NOT simulated.`);
      writeFileSync(
        join(OUTPUT_DIR, `${strategyId}.json`),
        JSON.stringify({ strategyId, timeframe, status: "DATA_QUALITY_FAIL", dataQuality }, null, 2),
      );
      summaries.push({
        strategyId,
        strategyName: strategy.name,
        timeframe,
        status: "DATA_QUALITY_FAIL",
        reason: dataQuality.rulesEvaluated.filter((r) => !r.passed).map((r) => r.rule).join(", "),
        dataset: datasetSummary,
      });
      continue;
    }

    try {
      const common = baseConfig(strategyId, timeframe, candles);

      const fullZero = engine.run({ ...common, costs: ZERO_COST_BASELINE }, candles);
      const fullRealistic = engine.run({ ...common, costs: REALISTIC_COST_SCENARIO }, candles);
      log(
        `[full-period, realistic costs] trades=${fullRealistic.metrics?.totalTrades} ` +
          `expectancyR=${fullRealistic.metrics?.expectancyR.toFixed(3)} ` +
          `netProfit=$${fullRealistic.metrics?.netProfit.toFixed(2)} ` +
          `sampleQuality=${fullRealistic.metrics?.sampleQuality}`,
      );

      const split = splitCandlesChronologically(candles);
      const splitDescription = describeDatasetSplit(split);
      const trainRun = engine.run(
        { ...common, costs: REALISTIC_COST_SCENARIO, dateFrom: splitDescription.train.from, dateTo: splitDescription.train.to },
        split.train,
      );
      const validationRun = engine.run(
        {
          ...common,
          costs: REALISTIC_COST_SCENARIO,
          dateFrom: splitDescription.validation.from,
          dateTo: splitDescription.validation.to,
        },
        split.validation,
      );
      const oosRun = engine.run(
        {
          ...common,
          costs: REALISTIC_COST_SCENARIO,
          dateFrom: splitDescription.outOfSample.from,
          dateTo: splitDescription.outOfSample.to,
        },
        split.outOfSample,
      );
      log(
        `[out-of-sample] trades=${oosRun.metrics?.totalTrades} expectancyR=${oosRun.metrics?.expectancyR.toFixed(3)} ` +
          `sampleQuality=${oosRun.metrics?.sampleQuality}`,
      );

      const wfConfig = walkForwardConfigFor(timeframe, candles.length);
      let walkForwardResults: ReturnType<typeof runWalkForwardWindows> = [];
      if (wfConfig) {
        const windows = buildWalkForwardWindows(candles, wfConfig);
        walkForwardResults = runWalkForwardWindows(engine, { ...common, costs: REALISTIC_COST_SCENARIO }, windows);
        log(`[walk-forward] ${windows.length} window(s), trainBars=${wfConfig.trainBars} validationBars=${wfConfig.validationBars} forwardBars=${wfConfig.forwardBars}`);
      } else {
        log(`[walk-forward] skipped — insufficient sample for a single full window at this timeframe.`);
      }

      const monteCarlo = runMonteCarloSimulation(fullRealistic.trades, INITIAL_CAPITAL, RISK_PER_TRADE_PCT, 1000, 42);
      log(
        `[monte-carlo] maxDrawdownPct p50=${monteCarlo.maxDrawdownPct.p50.toFixed(2)}% ` +
          `endingEquity p50=$${monteCarlo.endingEquity.p50.toFixed(2)} losingStreak p50=${monteCarlo.losingStreak.p50}`,
      );

      const buyAndHold = computeBuyAndHoldBaseline(candles, INITIAL_CAPITAL);
      log(`[buy-and-hold] netProfit=$${buyAndHold.netProfit.toFixed(2)} returnPct=${buyAndHold.returnPct.toFixed(2)}%`);

      writeFileSync(
        join(OUTPUT_DIR, `${strategyId}.json`),
        JSON.stringify(
          {
            strategyId,
            strategyName: strategy.name,
            strategyVersion: strategy.version,
            timeframe,
            generatedAt: new Date().toISOString(),
            dataset: datasetSummary,
            dataQuality,
            config: { initialCapital: INITIAL_CAPITAL, riskPerTradePct: RISK_PER_TRADE_PCT, sameCandlePolicy: DEFAULT_SAME_CANDLE_POLICY, riskRules: DEFAULT_RISK_RULES },
            fullPeriod: { zeroCost: fullZero, realisticCost: fullRealistic },
            datasetSplit: splitDescription,
            train: trainRun,
            validation: validationRun,
            outOfSample: oosRun,
            walkForward: { config: wfConfig, results: walkForwardResults },
            monteCarlo,
            buyAndHold,
          },
          null,
          2,
        ),
      );

      summaries.push({
        strategyId,
        strategyName: strategy.name,
        timeframe,
        status: "COMPLETED",
        dataset: datasetSummary,
        fullPeriodRealisticCost: fullRealistic.metrics,
        fullPeriodZeroCost: fullZero.metrics,
        outOfSample: oosRun.metrics,
        walkForwardWindowCount: walkForwardResults.length,
        buyAndHold,
      });
    } catch (error) {
      const message = error instanceof BacktestSimulationError ? `${error.code}: ${error.message}` : String(error);
      log(`[experiment] Simulation FAILED for ${strategyId}/${timeframe}: ${message}`);
      writeFileSync(
        join(OUTPUT_DIR, `${strategyId}.json`),
        JSON.stringify({ strategyId, timeframe, status: "SIMULATION_FAILED", reason: message, dataset: datasetSummary }, null, 2),
      );
      summaries.push({
        strategyId,
        strategyName: strategy.name,
        timeframe,
        status: "SIMULATION_FAILED",
        reason: message,
        dataset: datasetSummary,
      });
    }
  }

  writeFileSync(
    join(OUTPUT_DIR, "summary.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        alpacaFeed: process.env.ALPACA_FEED ?? "sip",
        experimentYears: EXPERIMENT_YEARS,
        initialCapital: INITIAL_CAPITAL,
        riskPerTradePct: RISK_PER_TRADE_PCT,
        riskRules: DEFAULT_RISK_RULES,
        costPresets: { zero: ZERO_COST_BASELINE, realistic: REALISTIC_COST_SCENARIO },
        sameCandlePolicy: DEFAULT_SAME_CANDLE_POLICY,
        strategies: summaries,
      },
      null,
      2,
    ),
  );

  log(`\n=== Experiment complete. Results written to ${OUTPUT_DIR} ===`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[experiment] Unhandled error:", error);
  process.exitCode = 1;
});
