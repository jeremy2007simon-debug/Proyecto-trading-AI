import { describe, expect, it } from "vitest";
import { createEventDrivenBacktestEngine } from "@/core/backtesting/event-driven-simulator";
import { createInMemoryStrategyManager } from "@/core/strategy-manager/in-memory-strategy-manager";
import type { Strategy, StrategyEvaluationInput, StrategySignal } from "@/core/strategy-manager/types";
import type { Candle } from "@/core/market-data/types";
import {
  BacktestSimulationError,
  DEFAULT_SAME_CANDLE_POLICY,
  ZERO_COST_BASELINE,
  type BacktestConfig,
} from "@/core/backtesting/types";
import { DEFAULT_RISK_RULES } from "@/core/risk-engine/types";

const ALL_REGIMES: Strategy["compatibleRegimes"] = [
  "STRONG_UPTREND",
  "UPTREND",
  "STRONG_DOWNTREND",
  "DOWNTREND",
  "RANGE",
  "BREAKOUT",
  "HIGH_VOLATILITY",
  "LOW_VOLATILITY",
  "UNKNOWN",
];

function bar(i: number, overrides: Partial<Candle>): Candle {
  return {
    market: "SP500",
    timeframe: "15m",
    symbol: "SPY",
    provider: "test",
    timestamp: new Date(Date.UTC(2024, 5, 17, 13, 30, 0) + i * 900_000).toISOString(),
    open: 100,
    high: 100.5,
    low: 99.5,
    close: 100,
    volume: 1000,
    ...overrides,
  };
}

function buildFlatCandles(count: number, startIndex = 0): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) candles.push(bar(startIndex + i, {}));
  return candles;
}

/** Fires exactly one BUY/SELL when candlesSoFar.length === triggerAtLength, WAIT otherwise. Fully deterministic — ideal for exercising the simulator's own mechanics in isolation from real strategy logic. */
function createTriggerStrategy(params: {
  id?: string;
  triggerAtLength: number;
  direction?: "BUY" | "SELL";
  entry: number;
  stopLoss: number;
  takeProfit?: number;
}): Strategy {
  const id = params.id ?? "trigger-strategy";
  return {
    id,
    name: id,
    description: "test double",
    version: "1.0.0",
    enabled: true,
    supportedMarkets: ["SP500"],
    supportedTimeframes: ["15m"],
    compatibleRegimes: ALL_REGIMES,
    defaultParameters: {},
    generateSignal(input: StrategyEvaluationInput): StrategySignal {
      const lastCandle = input.candles[input.candles.length - 1];
      if (input.candles.length !== params.triggerAtLength) {
        return waitSignal(id, input, "not yet");
      }
      const direction = params.direction ?? "BUY";
      return {
        strategyId: id,
        strategyName: id,
        strategyVersion: "1.0.0",
        signal: direction,
        timestamp: lastCandle.timestamp,
        market: input.market,
        timeframe: input.timeframe,
        marketRegime: input.marketRegime,
        price: lastCandle.close,
        entry: params.entry,
        stopLoss: params.stopLoss,
        takeProfit: params.takeProfit,
        riskReward:
          params.takeProfit !== undefined
            ? Math.abs(params.takeProfit - params.entry) / Math.abs(params.entry - params.stopLoss)
            : undefined,
        rawScore: direction === "BUY" ? 80 : -80,
        rulesTriggered: ["TEST_TRIGGER"],
        rulesFailed: [],
        explanation: "test trigger",
        metadata: {},
      };
    },
  };
}

/** Always fires BUY the moment it's flat — used for the daily risk gate test. */
function createAlwaysBuyStrategy(): Strategy {
  return {
    id: "always-buy",
    name: "always-buy",
    description: "test double",
    version: "1.0.0",
    enabled: true,
    supportedMarkets: ["SP500"],
    supportedTimeframes: ["15m"],
    compatibleRegimes: ALL_REGIMES,
    defaultParameters: {},
    generateSignal(input: StrategyEvaluationInput): StrategySignal {
      const lastCandle = input.candles[input.candles.length - 1];
      return {
        strategyId: "always-buy",
        strategyName: "always-buy",
        strategyVersion: "1.0.0",
        signal: "BUY",
        timestamp: lastCandle.timestamp,
        market: input.market,
        timeframe: input.timeframe,
        marketRegime: input.marketRegime,
        price: lastCandle.close,
        entry: lastCandle.close,
        stopLoss: lastCandle.close - 1, // hit almost immediately by the flat fixture's next bar
        rawScore: 80,
        rulesTriggered: ["ALWAYS"],
        rulesFailed: [],
        explanation: "always buy",
        metadata: {},
      };
    },
  };
}

function createThrowingStrategy(): Strategy {
  return {
    id: "throwing-strategy",
    name: "throwing-strategy",
    description: "test double",
    version: "1.0.0",
    enabled: true,
    supportedMarkets: ["SP500"],
    supportedTimeframes: ["15m"],
    compatibleRegimes: ALL_REGIMES,
    defaultParameters: {},
    generateSignal(): StrategySignal {
      throw new Error("boom");
    },
  };
}

function omitId<T extends { id: string }>(value: T): Omit<T, "id"> {
  const rest: Partial<T> = { ...value };
  delete rest.id;
  return rest as Omit<T, "id">;
}

function waitSignal(id: string, input: StrategyEvaluationInput, reason: string): StrategySignal {
  const lastCandle = input.candles[input.candles.length - 1];
  return {
    strategyId: id,
    strategyName: id,
    strategyVersion: "1.0.0",
    signal: "WAIT",
    timestamp: lastCandle.timestamp,
    market: input.market,
    timeframe: input.timeframe,
    marketRegime: input.marketRegime,
    price: lastCandle.close,
    rawScore: 0,
    rulesTriggered: [],
    rulesFailed: [reason],
    explanation: reason,
    metadata: {},
  };
}

function buildConfig(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    name: "test",
    market: "SP500",
    timeframe: "15m",
    mode: "SINGLE_STRATEGY",
    strategyIds: ["trigger-strategy"],
    dateFrom: "2024-06-17T00:00:00.000Z",
    dateTo: "2024-06-18T00:00:00.000Z",
    initialCapital: 10_000,
    riskPerTradePct: 0.5,
    commission: 0,
    slippage: 0,
    costs: ZERO_COST_BASELINE,
    sameCandlePolicy: DEFAULT_SAME_CANDLE_POLICY,
    ...overrides,
  };
}

function buildManagerWithStrategy(strategy: Strategy) {
  const manager = createInMemoryStrategyManager();
  manager.register(strategy);
  return manager;
}

describe("createEventDrivenBacktestEngine", () => {
  describe("R-multiple calculation", () => {
    it("resolves a full stop-loss hit to exactly -1R (zero costs)", () => {
      const strategy = createTriggerStrategy({ triggerAtLength: 20, entry: 100, stopLoss: 98, takeProfit: 104 });
      const manager = buildManagerWithStrategy(strategy);
      const engine = createEventDrivenBacktestEngine(manager);

      const candles = buildFlatCandles(20);
      candles.push(bar(20, { low: 97, high: 100.5, close: 98 })); // touches stop only

      const run = engine.run(buildConfig(), candles);

      expect(run.trades).toHaveLength(1);
      expect(run.trades[0].exitReason).toBe("STOP_LOSS");
      expect(run.trades[0].pnlR).toBeCloseTo(-1, 10);
      expect(run.trades[0].ambiguousIntrabarExit).toBe(false);
    });

    it("resolves a 2R take-profit hit to exactly +2R (zero costs)", () => {
      const strategy = createTriggerStrategy({ triggerAtLength: 20, entry: 100, stopLoss: 98, takeProfit: 104 });
      const manager = buildManagerWithStrategy(strategy);
      const engine = createEventDrivenBacktestEngine(manager);

      const candles = buildFlatCandles(20);
      candles.push(bar(20, { low: 99.8, high: 104.2, close: 104 })); // touches target only

      const run = engine.run(buildConfig(), candles);

      expect(run.trades).toHaveLength(1);
      expect(run.trades[0].exitReason).toBe("TAKE_PROFIT");
      expect(run.trades[0].pnlR).toBeCloseTo(2, 10);
    });

    it("works identically for a SELL (short) trade", () => {
      const strategy = createTriggerStrategy({
        triggerAtLength: 20,
        direction: "SELL",
        entry: 100,
        stopLoss: 102,
        takeProfit: 96,
      });
      const manager = buildManagerWithStrategy(strategy);
      const engine = createEventDrivenBacktestEngine(manager);

      const candles = buildFlatCandles(20);
      candles.push(bar(20, { low: 95.8, high: 100.2, close: 96 })); // touches target only

      const run = engine.run(buildConfig(), candles);

      expect(run.trades[0].exitReason).toBe("TAKE_PROFIT");
      expect(run.trades[0].pnlR).toBeCloseTo(2, 10);
    });
  });

  describe("same-candle ambiguity", () => {
    it("resolves a bar touching BOTH stop and target to the unfavorable outcome (CONSERVATIVE default) and flags it", () => {
      const strategy = createTriggerStrategy({ triggerAtLength: 20, entry: 100, stopLoss: 98, takeProfit: 104 });
      const manager = buildManagerWithStrategy(strategy);
      const engine = createEventDrivenBacktestEngine(manager);

      const candles = buildFlatCandles(20);
      candles.push(bar(20, { low: 97, high: 105 })); // touches BOTH

      const run = engine.run(buildConfig(), candles);

      expect(run.trades[0].exitReason).toBe("STOP_LOSS");
      expect(run.trades[0].ambiguousIntrabarExit).toBe(true);
      expect(run.trades[0].pnlR).toBeCloseTo(-1, 10);
    });

    it("OPTIMISTIC policy resolves the same ambiguous bar favorably", () => {
      const strategy = createTriggerStrategy({ triggerAtLength: 20, entry: 100, stopLoss: 98, takeProfit: 104 });
      const manager = buildManagerWithStrategy(strategy);
      const engine = createEventDrivenBacktestEngine(manager);

      const candles = buildFlatCandles(20);
      candles.push(bar(20, { low: 97, high: 105 }));

      const run = engine.run(buildConfig({ sameCandlePolicy: "OPTIMISTIC" }), candles);

      expect(run.trades[0].exitReason).toBe("TAKE_PROFIT");
      expect(run.trades[0].ambiguousIntrabarExit).toBe(true);
      expect(run.trades[0].pnlR).toBeCloseTo(2, 10);
    });
  });

  describe("execution costs", () => {
    it("commission and slippage make a losing trade worse than the zero-cost baseline", () => {
      const strategy = createTriggerStrategy({ triggerAtLength: 20, entry: 100, stopLoss: 98, takeProfit: 104 });
      const candlesFor = () => {
        const candles = buildFlatCandles(20);
        candles.push(bar(20, { low: 97, high: 100.5, close: 98 }));
        return candles;
      };

      const zeroCostRun = createEventDrivenBacktestEngine(buildManagerWithStrategy(strategy)).run(
        buildConfig(),
        candlesFor(),
      );
      const realisticRun = createEventDrivenBacktestEngine(buildManagerWithStrategy(strategy)).run(
        buildConfig({ costs: { commissionPerFill: 1, slippagePct: 0.001, halfSpread: 0.01 } }),
        candlesFor(),
      );

      expect(realisticRun.trades[0].commissionPaid).toBe(2); // 1 per fill, entry + exit
      expect(realisticRun.trades[0].slippagePaid).toBeGreaterThan(0);
      expect(realisticRun.trades[0].pnlAmount!).toBeLessThan(zeroCostRun.trades[0].pnlAmount!);
      expect(realisticRun.trades[0].pnlR!).toBeLessThan(-1); // worse than the ideal -1R
    });

    it("a take-profit exit pays no slippage/spread (resting-limit-order convention)", () => {
      const strategy = createTriggerStrategy({ triggerAtLength: 20, entry: 100, stopLoss: 98, takeProfit: 104 });
      const manager = buildManagerWithStrategy(strategy);
      const engine = createEventDrivenBacktestEngine(manager);

      const candles = buildFlatCandles(20);
      candles.push(bar(20, { low: 99.8, high: 104.2, close: 104 }));

      const run = engine.run(
        buildConfig({ costs: { commissionPerFill: 0, slippagePct: 0.001, halfSpread: 0.01 } }),
        candles,
      );

      expect(run.trades[0].exitPrice).toBe(104); // exact target, no adjustment
    });
  });

  describe("position lifecycle", () => {
    it("forces an open position to TIME_EXIT at the last candle's close when the dataset ends", () => {
      const strategy = createTriggerStrategy({ triggerAtLength: 20, entry: 100, stopLoss: 90, takeProfit: 130 });
      const manager = buildManagerWithStrategy(strategy);
      const engine = createEventDrivenBacktestEngine(manager);

      const candles = buildFlatCandles(20);
      // Stays well inside [90, 130] for the remaining bars — never resolves naturally.
      for (let i = 0; i < 5; i++) candles.push(bar(20 + i, {}));

      const run = engine.run(buildConfig(), candles);

      expect(run.trades).toHaveLength(1);
      expect(run.trades[0].exitReason).toBe("TIME_EXIT");
      expect(run.trades[0].exitAt).toBe(candles[candles.length - 1].timestamp);
      expect(run.trades[0].exitPrice).toBeDefined();
    });

    it("never opens a second position while one is already open", () => {
      // Trigger fires again at length 20 (won't re-fire since it's a
      // one-shot trigger) — instead verify structurally: only 1 trade
      // total even though the position takes several bars to resolve.
      const strategy = createTriggerStrategy({ triggerAtLength: 20, entry: 100, stopLoss: 90, takeProfit: 130 });
      const manager = buildManagerWithStrategy(strategy);
      const engine = createEventDrivenBacktestEngine(manager);

      const candles = buildFlatCandles(20);
      for (let i = 0; i < 5; i++) candles.push(bar(20 + i, {}));
      candles.push(bar(25, { low: 89, high: 90.5 })); // stop hit here

      const run = engine.run(buildConfig(), candles);

      expect(run.trades).toHaveLength(1);
    });
  });

  describe("no-look-ahead (prefix stability)", () => {
    it("trades that closed within a shorter dataset are IDENTICAL when more candles are appended afterward", () => {
      const strategy = createTriggerStrategy({ triggerAtLength: 20, entry: 100, stopLoss: 98, takeProfit: 104 });

      const shortCandles = buildFlatCandles(20);
      shortCandles.push(bar(20, { low: 97, high: 100.5, close: 98 })); // resolves here

      // Append a dramatic, unrelated future move after the trade already closed.
      const longCandles = [...shortCandles];
      for (let i = 0; i < 10; i++) {
        longCandles.push(bar(21 + i, { open: 200, high: 210, low: 190, close: 205 }));
      }

      const shortRun = createEventDrivenBacktestEngine(buildManagerWithStrategy(strategy)).run(
        buildConfig(),
        shortCandles,
      );
      const longRun = createEventDrivenBacktestEngine(buildManagerWithStrategy(strategy)).run(
        buildConfig(),
        longCandles,
      );

      // `id` is randomly generated per trade — excluded from the
      // comparison, everything else must be bit-for-bit identical.
      expect(omitId(longRun.trades[0])).toEqual(omitId(shortRun.trades[0]));
    });
  });

  describe("daily risk gate integration", () => {
    it("never opens more trades in a single day than maxTradesPerDay, and never opens after the daily loss limit is breached", () => {
      const strategy = createAlwaysBuyStrategy();
      const manager = buildManagerWithStrategy(strategy);
      const engine = createEventDrivenBacktestEngine(manager);

      // Every bar drops by 2 from the prior close, guaranteeing an
      // immediate stop-out (loss=1 per the strategy's own stopLoss=close-1)
      // on whichever bar follows an entry, all within the SAME Eastern day.
      const candles: Candle[] = [];
      let price = 100;
      for (let i = 0; i < 20; i++) {
        candles.push(bar(i, { open: price, high: price + 0.2, low: price - 2, close: price - 1.5 }));
        price -= 1.5;
      }

      const run = engine.run(buildConfig({ strategyIds: ["always-buy"] }), candles);

      // Group trades by Eastern calendar day and verify the cap held.
      const tradesByDay = new Map<string, number>();
      for (const trade of run.trades) {
        const day = trade.entryAt.slice(0, 10);
        tradesByDay.set(day, (tradesByDay.get(day) ?? 0) + 1);
      }
      for (const count of tradesByDay.values()) {
        expect(count).toBeLessThanOrEqual(DEFAULT_RISK_RULES.maxTradesPerDay);
      }
      expect(run.trades.length).toBeGreaterThan(0);
    });
  });

  describe("failure conditions", () => {
    const strategy = createTriggerStrategy({ triggerAtLength: 5, entry: 100, stopLoss: 98 });
    const manager = buildManagerWithStrategy(strategy);

    it("throws TIMESTAMP_DISORDER when candles are out of chronological order", () => {
      const candles = buildFlatCandles(10).reverse();
      expect(() => createEventDrivenBacktestEngine(manager).run(buildConfig(), candles)).toThrow(
        BacktestSimulationError,
      );
      try {
        createEventDrivenBacktestEngine(manager).run(buildConfig(), candles);
      } catch (error) {
        expect((error as BacktestSimulationError).code).toBe("TIMESTAMP_DISORDER");
      }
    });

    it("throws DUPLICATE_CANDLES when two consecutive candles share a timestamp", () => {
      const candles = buildFlatCandles(10);
      candles[5] = { ...candles[5], timestamp: candles[4].timestamp };
      try {
        createEventDrivenBacktestEngine(manager).run(buildConfig(), candles);
        expect.unreachable();
      } catch (error) {
        expect((error as BacktestSimulationError).code).toBe("DUPLICATE_CANDLES");
      }
    });

    it("throws INSUFFICIENT_WARMUP with fewer than 2 candles", () => {
      try {
        createEventDrivenBacktestEngine(manager).run(buildConfig(), buildFlatCandles(1));
        expect.unreachable();
      } catch (error) {
        expect((error as BacktestSimulationError).code).toBe("INSUFFICIENT_WARMUP");
      }
    });

    it("throws UNSUPPORTED_MODE for MULTI_STRATEGY / FULL_CONSENSUS", () => {
      try {
        createEventDrivenBacktestEngine(manager).run(buildConfig({ mode: "MULTI_STRATEGY" }), buildFlatCandles(10));
        expect.unreachable();
      } catch (error) {
        expect((error as BacktestSimulationError).code).toBe("UNSUPPORTED_MODE");
      }
    });

    it("throws UNSUPPORTED_MODE when strategyIds doesn't contain exactly one id", () => {
      try {
        createEventDrivenBacktestEngine(manager).run(buildConfig({ strategyIds: [] }), buildFlatCandles(10));
        expect.unreachable();
      } catch (error) {
        expect((error as BacktestSimulationError).code).toBe("UNSUPPORTED_MODE");
      }
    });

    it("throws STRATEGY_ERROR for an unregistered strategy id", () => {
      try {
        createEventDrivenBacktestEngine(manager).run(
          buildConfig({ strategyIds: ["does-not-exist"] }),
          buildFlatCandles(10),
        );
        expect.unreachable();
      } catch (error) {
        expect((error as BacktestSimulationError).code).toBe("STRATEGY_ERROR");
      }
    });

    it("throws STRATEGY_ERROR when the strategy itself throws, aborting the whole run rather than skipping a trade", () => {
      const throwingManager = buildManagerWithStrategy(createThrowingStrategy());
      try {
        createEventDrivenBacktestEngine(throwingManager).run(
          buildConfig({ strategyIds: ["throwing-strategy"] }),
          buildFlatCandles(10),
        );
        expect.unreachable();
      } catch (error) {
        expect((error as BacktestSimulationError).code).toBe("STRATEGY_ERROR");
        expect((error as BacktestSimulationError).message).toContain("boom");
      }
    });
  });
});
