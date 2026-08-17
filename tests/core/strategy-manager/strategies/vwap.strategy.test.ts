import { describe, expect, it } from "vitest";
import {
  VWAP_STRATEGY_DEFAULT_PARAMETERS,
  vwapStrategy,
} from "@/core/strategy-manager/strategies/vwap.strategy";
import type { StrategyEvaluationInput } from "@/core/strategy-manager/types";
import type { Candle } from "@/core/market-data/types";

const SESSION_1_START = Date.UTC(2024, 5, 17, 13, 30, 0); // 2024-06-17 09:30 EDT
const SESSION_2_START = Date.UTC(2024, 5, 18, 13, 30, 0); // 2024-06-18 09:30 EDT
const FIFTEEN_MIN_MS = 900_000;

function bar(timestampMs: number, overrides: Partial<Candle>): Candle {
  return {
    market: "SP500",
    timeframe: "15m",
    symbol: "SPY",
    provider: "test",
    timestamp: new Date(timestampMs).toISOString(),
    open: 100,
    high: 100.6,
    low: 99.4,
    close: 100,
    volume: 100_000,
    ...overrides,
  };
}

/** A geometric decline (keeps VWAP lagging above price) followed by a sharp rally that crosses back above VWAP. */
function buildReclaimCandles(): Candle[] {
  const candles: Candle[] = [];
  let price = 500;
  for (let i = 0; i < 34; i++) {
    const close = price;
    candles.push(
      bar(SESSION_1_START + i * FIFTEEN_MIN_MS, {
        open: price * 1.001,
        high: price * 1.002,
        low: price * 0.999,
        close,
        volume: 100_000,
      }),
    );
    price = price * 0.998;
  }
  // Sharp rally: 2 strong up bars with heavy volume — the second is where
  // distancePct actually crosses back above zero, flipping momentum and
  // price above VWAP on that exact (last) bar.
  for (let i = 0; i < 2; i++) {
    price = price * 1.03;
    candles.push(
      bar(SESSION_1_START + (34 + i) * FIFTEEN_MIN_MS, {
        open: price * 0.99,
        high: price * 1.01,
        low: price * 0.98,
        close: price,
        volume: 300_000,
      }),
    );
  }
  return candles;
}

function buildRejectionCandles(): Candle[] {
  const candles: Candle[] = [];
  let price = 500;
  for (let i = 0; i < 34; i++) {
    const close = price;
    candles.push(
      bar(SESSION_1_START + i * FIFTEEN_MIN_MS, {
        open: price * 0.999,
        high: price * 1.001,
        low: price * 0.998,
        close,
        volume: 100_000,
      }),
    );
    price = price * 1.002;
  }
  for (let i = 0; i < 2; i++) {
    price = price * 0.97;
    candles.push(
      bar(SESSION_1_START + (34 + i) * FIFTEEN_MIN_MS, {
        open: price * 1.01,
        high: price * 1.02,
        low: price * 0.99,
        close: price,
        volume: 300_000,
      }),
    );
  }
  return candles;
}

/** Perfectly flat: typical price === close every bar, so distancePct stays exactly 0 (no cross, no persistence sign). */
function buildFlatCandles(count: number, startMs: number): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    candles.push(bar(startMs + i * FIFTEEN_MIN_MS, { open: 100, high: 100.3, low: 99.7, close: 100 }));
  }
  return candles;
}

function baseInput(candles: Candle[], overrides: Partial<StrategyEvaluationInput> = {}): StrategyEvaluationInput {
  return {
    market: "SP500",
    timeframe: "15m",
    candles,
    indicators: {},
    marketRegime: "RANGE",
    parameters: {},
    ...overrides,
  };
}

describe("vwapStrategy", () => {
  it("produces a BUY (VWAP_RECLAIM) signal when price crosses back above VWAP with bullish momentum", () => {
    const signal = vwapStrategy.generateSignal(baseInput(buildReclaimCandles()));

    expect(signal.signal).toBe("BUY");
    expect(signal.metadata.setupType).toBe("VWAP_RECLAIM");
    expect(signal.rawScore).toBeGreaterThan(0);
    expect(signal.riskReward).toBeGreaterThanOrEqual(VWAP_STRATEGY_DEFAULT_PARAMETERS.minimumRiskReward);
    expect(signal.rulesFailed).toEqual([]);
  });

  it("produces a SELL (VWAP_REJECTION) signal when price crosses back below VWAP with bearish momentum", () => {
    const signal = vwapStrategy.generateSignal(baseInput(buildRejectionCandles()));

    expect(signal.signal).toBe("SELL");
    expect(signal.metadata.setupType).toBe("VWAP_REJECTION");
    expect(signal.rawScore).toBeLessThan(0);
    expect(signal.riskReward).toBeGreaterThanOrEqual(VWAP_STRATEGY_DEFAULT_PARAMETERS.minimumRiskReward);
  });

  it("WAITs when there isn't enough warmed-up history", () => {
    const signal = vwapStrategy.generateSignal(baseInput(buildFlatCandles(10, SESSION_1_START)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["INSUFFICIENT_DATA"]);
    expect(signal.entry).toBeUndefined();
  });

  it("WAITs when there's no cross and no persistent, non-extended continuation", () => {
    const signal = vwapStrategy.generateSignal(baseInput(buildFlatCandles(40, SESSION_1_START)));

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["NO_VWAP_SETUP"]);
    expect(signal.entry).toBeUndefined();
  });

  it("WAITs when the computed risk:reward is below the configured minimum", () => {
    const signal = vwapStrategy.generateSignal(
      baseInput(buildReclaimCandles(), { parameters: { takeProfitRMultiple: 0.5 } }),
    );

    expect(signal.signal).toBe("WAIT");
    expect(signal.rulesFailed).toEqual(["MINIMUM_RISK_REWARD"]);
    expect(signal.metadata.candidateRiskReward).toBeLessThan(VWAP_STRATEGY_DEFAULT_PARAMETERS.minimumRiskReward);
  });

  it("does NOT treat a session reset as a VWAP reclaim/rejection cross", () => {
    // Session 1 ends deep below its own VWAP (should look like a strong
    // "negative distancePct" baseline). Session 2 opens with a single,
    // unremarkable bar — its distancePct is computed against its OWN
    // fresh VWAP, not session 1's. A buggy implementation comparing
    // vwapPrev (session 1's last bar) against vwapNow (session 2's first
    // bar) could misread the reset itself as a bullish cross.
    const session1 = buildFlatCandles(34, SESSION_1_START).map((c, i) => ({
      ...c,
      close: 100 - i * 2, // steadily declining well below VWAP by session end
      low: 100 - i * 2 - 0.5,
      high: 100 - i * 2 + 0.2,
    }));
    const session2Open = bar(SESSION_2_START, { open: 100, high: 100.3, low: 99.7, close: 100, volume: 100_000 });
    const candles = [...session1, session2Open];

    const signal = vwapStrategy.generateSignal(baseInput(candles));

    expect(signal.metadata.setupType).not.toBe("VWAP_RECLAIM");
    expect(signal.metadata.setupType).not.toBe("VWAP_REJECTION");
  });

  it("is prefix-stable: never depends on candles beyond the current (last) bar", () => {
    const reclaim = buildReclaimCandles();
    const future = buildFlatCandles(10, SESSION_1_START + reclaim.length * FIFTEEN_MIN_MS);
    const withFuture = [...reclaim, ...future];

    const fromShort = vwapStrategy.generateSignal(baseInput(reclaim));
    const fromPrefixOfLonger = vwapStrategy.generateSignal(baseInput(withFuture.slice(0, reclaim.length)));

    expect(fromPrefixOfLonger).toEqual(fromShort);
  });

  it("was not touched by Block 4.5's timeframe/market generalization (still 15m-only, SP500-only)", () => {
    expect(vwapStrategy.supportedTimeframes).toEqual(["15m"]);
    expect(vwapStrategy.supportedMarkets).toEqual(["SP500"]);
  });
});
