import { describe, expect, it, vi } from "vitest";
import { createInMemoryStrategyManager } from "@/core/strategy-manager/in-memory-strategy-manager";
import type {
  Strategy,
  StrategyEvaluationInput,
  StrategySignal,
} from "@/core/strategy-manager/types";
import type { Candle } from "@/core/market-data/types";

function candle(overrides: Partial<Candle> = {}): Candle {
  return {
    market: "SP500",
    timeframe: "15m",
    timestamp: "2024-06-17T14:00:00.000Z",
    symbol: "SPY",
    provider: "test",
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
    ...overrides,
  };
}

function baseInput(overrides: Partial<StrategyEvaluationInput> = {}): StrategyEvaluationInput {
  return {
    market: "SP500",
    timeframe: "15m",
    candles: [candle()],
    indicators: {},
    marketRegime: "STRONG_UPTREND",
    parameters: {},
    ...overrides,
  };
}

function buySignal(strategy: Strategy, input: StrategyEvaluationInput): StrategySignal {
  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    strategyVersion: strategy.version,
    signal: "BUY",
    timestamp: input.candles[input.candles.length - 1].timestamp,
    market: input.market,
    timeframe: input.timeframe,
    marketRegime: input.marketRegime,
    price: 100,
    entry: 100,
    stopLoss: 98,
    takeProfit: 104,
    riskReward: 2,
    rawScore: 60,
    rulesTriggered: ["TEST_RULE"],
    rulesFailed: [],
    explanation: "test buy",
    metadata: {},
  };
}

function makeStrategy(overrides: Partial<Strategy> & { id: string }): Strategy {
  const strategy: Strategy = {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    description: overrides.description ?? "test strategy",
    version: overrides.version ?? "1.0.0",
    enabled: overrides.enabled ?? true,
    supportedMarkets: overrides.supportedMarkets ?? ["SP500"],
    supportedTimeframes: overrides.supportedTimeframes ?? ["15m"],
    compatibleRegimes: overrides.compatibleRegimes ?? ["STRONG_UPTREND"],
    defaultParameters: overrides.defaultParameters ?? { foo: 1 },
    generateSignal: overrides.generateSignal ?? ((input) => buySignal(strategy, input)),
  };
  return strategy;
}

describe("createInMemoryStrategyManager", () => {
  it("registers a strategy with its default enabled flag and a copy of its default parameters", () => {
    const manager = createInMemoryStrategyManager();
    const strategy = makeStrategy({ id: "s1", enabled: false, defaultParameters: { a: 1 } });

    manager.register(strategy);
    const registration = manager.getRegistration("s1");

    expect(registration?.enabled).toBe(false);
    expect(registration?.parameters).toEqual({ a: 1 });
    expect(registration?.parameters).not.toBe(strategy.defaultParameters);
    expect(registration?.weight).toBe(1);
  });

  it("register accepts an explicit weight", () => {
    const manager = createInMemoryStrategyManager();
    manager.register(makeStrategy({ id: "s1" }), { weight: 0.4 });
    expect(manager.getRegistration("s1")?.weight).toBe(0.4);
  });

  it("setEnabled/setParameters/setWeight mutate only the targeted registration", () => {
    const manager = createInMemoryStrategyManager();
    manager.register(makeStrategy({ id: "s1", defaultParameters: { a: 1 } }));
    manager.register(makeStrategy({ id: "s2", defaultParameters: { a: 1 } }));

    manager.setEnabled("s1", false);
    manager.setParameters("s1", { b: 2 });
    manager.setWeight("s1", 0.7);

    expect(manager.getRegistration("s1")).toMatchObject({
      enabled: false,
      parameters: { a: 1, b: 2 },
      weight: 0.7,
    });
    expect(manager.getRegistration("s2")).toMatchObject({
      enabled: true,
      parameters: { a: 1 },
      weight: 1,
    });
  });

  it("setEnabled/setParameters/setWeight on an unknown id are a no-op, not a throw", () => {
    const manager = createInMemoryStrategyManager();
    expect(() => manager.setEnabled("missing", true)).not.toThrow();
    expect(() => manager.setParameters("missing", {})).not.toThrow();
    expect(() => manager.setWeight("missing", 1)).not.toThrow();
  });

  it("listRegistrations filters by supportedMarkets when a market is given", () => {
    const manager = createInMemoryStrategyManager();
    manager.register(makeStrategy({ id: "sp500-only", supportedMarkets: ["SP500"] }));
    manager.register(makeStrategy({ id: "gold-only", supportedMarkets: ["GOLD"] }));

    expect(manager.listRegistrations("SP500").map((r) => r.strategy.id)).toEqual(["sp500-only"]);
    expect(manager.listRegistrations().map((r) => r.strategy.id).sort()).toEqual([
      "gold-only",
      "sp500-only",
    ]);
  });

  it("listEnabled filters by enabled AND supportedMarkets AND supportedTimeframes", () => {
    const manager = createInMemoryStrategyManager();
    manager.register(makeStrategy({ id: "match", supportedMarkets: ["SP500"], supportedTimeframes: ["15m"] }));
    manager.register(makeStrategy({ id: "wrong-timeframe", supportedMarkets: ["SP500"], supportedTimeframes: ["5m"] }));
    manager.register(makeStrategy({ id: "wrong-market", supportedMarkets: ["GOLD"], supportedTimeframes: ["15m"] }));
    manager.register(makeStrategy({ id: "disabled", enabled: false }));

    expect(manager.listEnabled("SP500", "15m").map((r) => r.strategy.id)).toEqual(["match"]);
  });

  it("generateSignals synthesizes a WAIT for a regime-incompatible strategy WITHOUT calling generateSignal", () => {
    const manager = createInMemoryStrategyManager();
    const generateSignal = vi.fn(() => buySignal({ id: "s1" } as Strategy, baseInput()));
    manager.register(
      makeStrategy({ id: "s1", compatibleRegimes: ["RANGE"], generateSignal }),
    );

    const [signal] = manager.generateSignals(baseInput({ marketRegime: "STRONG_UPTREND" }));

    expect(generateSignal).not.toHaveBeenCalled();
    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["REGIME_COMPATIBILITY"]);
    expect(signal.entry).toBeUndefined();
    expect(signal.strategyId).toBe("s1");
    expect(signal.strategyVersion).toBe("1.0.0");
  });

  it("generateSignals isolates a strategy that throws: it becomes WAIT/INTERNAL_ERROR and does not stop the other strategies", () => {
    const manager = createInMemoryStrategyManager();
    manager.register(
      makeStrategy({
        id: "broken",
        generateSignal: () => {
          throw new Error("boom");
        },
      }),
    );
    manager.register(makeStrategy({ id: "healthy" }));

    const signals = manager.generateSignals(baseInput());
    const broken = signals.find((s) => s.strategyId === "broken");
    const healthy = signals.find((s) => s.strategyId === "healthy");

    expect(broken?.signal).toBe("WAIT");
    expect(broken?.rulesFailed).toEqual(["INTERNAL_ERROR"]);
    expect(broken?.explanation).toContain("boom");
    expect(healthy?.signal).toBe("BUY");
  });

  it("generateSignals passes the registration's live parameters (not the strategy's defaults) to generateSignal", () => {
    const manager = createInMemoryStrategyManager();
    const generateSignal = vi.fn((input: StrategyEvaluationInput) =>
      buySignal({ id: "s1", name: "s1", version: "1.0.0" } as Strategy, input),
    );
    manager.register(makeStrategy({ id: "s1", defaultParameters: { a: 1 }, generateSignal }));
    manager.setParameters("s1", { a: 2, b: 3 });

    manager.generateSignals(baseInput({ parameters: { a: 999 } }));

    expect(generateSignal).toHaveBeenCalledWith(expect.objectContaining({ parameters: { a: 2, b: 3 } }));
  });

  it("generateSignals only evaluates enabled strategies matching the requested market/timeframe", () => {
    const manager = createInMemoryStrategyManager();
    manager.register(makeStrategy({ id: "match" }));
    manager.register(makeStrategy({ id: "disabled", enabled: false }));
    manager.register(makeStrategy({ id: "wrong-timeframe", supportedTimeframes: ["5m"] }));

    const signals = manager.generateSignals(baseInput());

    expect(signals.map((s) => s.strategyId)).toEqual(["match"]);
  });
});
