import { describe, expect, it } from "vitest";
import { resolveIntrabarExit } from "@/core/backtesting/same-candle-resolver";
import type { Candle } from "@/core/market-data/types";

function bar(overrides: Partial<Candle>): Candle {
  return {
    market: "SP500",
    timeframe: "15m",
    symbol: "SPY",
    provider: "test",
    timestamp: "2024-06-17T14:00:00.000Z",
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1000,
    ...overrides,
  };
}

describe("resolveIntrabarExit", () => {
  describe("BUY position", () => {
    const position = { direction: "BUY" as const, stopLoss: 98, takeProfit: 104 };

    it("resolves to STOP_LOSS when only the stop is touched", () => {
      const result = resolveIntrabarExit(position, bar({ low: 97, high: 100 }), "CONSERVATIVE");
      expect(result).toEqual({ exitPrice: 98, exitReason: "STOP_LOSS", ambiguous: false });
    });

    it("resolves to TAKE_PROFIT when only the target is touched", () => {
      const result = resolveIntrabarExit(position, bar({ low: 100, high: 105 }), "CONSERVATIVE");
      expect(result).toEqual({ exitPrice: 104, exitReason: "TAKE_PROFIT", ambiguous: false });
    });

    it("returns null when neither level is touched", () => {
      const result = resolveIntrabarExit(position, bar({ low: 99, high: 101 }), "CONSERVATIVE");
      expect(result).toBeNull();
    });

    it("CONSERVATIVE policy resolves an ambiguous bar (both touched) to the unfavorable STOP_LOSS", () => {
      const result = resolveIntrabarExit(position, bar({ low: 97, high: 105 }), "CONSERVATIVE");
      expect(result).toEqual({ exitPrice: 98, exitReason: "STOP_LOSS", ambiguous: true });
    });

    it("OPTIMISTIC policy resolves the same ambiguous bar to the favorable TAKE_PROFIT", () => {
      const result = resolveIntrabarExit(position, bar({ low: 97, high: 105 }), "OPTIMISTIC");
      expect(result).toEqual({ exitPrice: 104, exitReason: "TAKE_PROFIT", ambiguous: true });
    });

    it("never treats a missing takeProfit as touched, and never flags ambiguity without one", () => {
      const noTarget = { direction: "BUY" as const, stopLoss: 98 };
      const result = resolveIntrabarExit(noTarget, bar({ low: 97, high: 150 }), "CONSERVATIVE");
      expect(result).toEqual({ exitPrice: 98, exitReason: "STOP_LOSS", ambiguous: false });
    });
  });

  describe("SELL position (symmetric)", () => {
    const position = { direction: "SELL" as const, stopLoss: 102, takeProfit: 96 };

    it("resolves to STOP_LOSS when only the stop (above entry) is touched", () => {
      const result = resolveIntrabarExit(position, bar({ low: 99, high: 103 }), "CONSERVATIVE");
      expect(result).toEqual({ exitPrice: 102, exitReason: "STOP_LOSS", ambiguous: false });
    });

    it("resolves to TAKE_PROFIT when only the target (below entry) is touched", () => {
      const result = resolveIntrabarExit(position, bar({ low: 95, high: 100 }), "CONSERVATIVE");
      expect(result).toEqual({ exitPrice: 96, exitReason: "TAKE_PROFIT", ambiguous: false });
    });

    it("CONSERVATIVE resolves an ambiguous SELL bar to STOP_LOSS", () => {
      const result = resolveIntrabarExit(position, bar({ low: 95, high: 103 }), "CONSERVATIVE");
      expect(result).toEqual({ exitPrice: 102, exitReason: "STOP_LOSS", ambiguous: true });
    });

    it("OPTIMISTIC resolves the same ambiguous SELL bar to TAKE_PROFIT", () => {
      const result = resolveIntrabarExit(position, bar({ low: 95, high: 103 }), "OPTIMISTIC");
      expect(result).toEqual({ exitPrice: 96, exitReason: "TAKE_PROFIT", ambiguous: true });
    });

    it("returns null when neither level is touched", () => {
      const result = resolveIntrabarExit(position, bar({ low: 99, high: 101 }), "CONSERVATIVE");
      expect(result).toBeNull();
    });
  });
});
