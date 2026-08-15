import { describe, expect, it } from "vitest";
import { createVwap } from "@/core/indicators/vwap";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import { buildCandles } from "./fixtures";
import { assertPrefixStability } from "./prefix-stability.helper";

describe("createVwap", () => {
  const calendar = createNyseCalendar();
  const vwap = createVwap(calendar);

  const candles = buildCandles([
    // Session 1 (2024-06-17, RTH open 13:30Z).
    { timestamp: "2024-06-17T13:30:00.000Z", high: 101, low: 99, close: 100, volume: 100 },
    { timestamp: "2024-06-17T14:30:00.000Z", high: 103, low: 101, close: 102, volume: 200 },
    // Session 2 (next trading day) — VWAP must reset, not blend with session 1.
    { timestamp: "2024-06-18T13:30:00.000Z", high: 201, low: 199, close: 200, volume: 50 },
  ]);

  it("computes volume-weighted typical price within a session", () => {
    const values = vwap.compute(candles);
    // bar0: typical=(101+99+100)/3=100, PV=10000, cumVol=100 -> vwap=100
    expect(values[0].value).toBeCloseTo(100, 6);
    // bar1: typical=(103+101+102)/3=102, cumPV=10000+20400=30400, cumVol=300 -> vwap=101.333...
    expect(values[1].value).toBeCloseTo(101.3333, 4);
  });

  it("resets the cumulative sums at the start of a new trading session", () => {
    const values = vwap.compute(candles);
    // bar2 is the first bar of a new session: vwap must equal its own
    // typical price (200), NOT a blend with session 1's volume.
    expect(values[2].value).toBeCloseTo(200, 6);
    expect(values[2].distancePct).toBeCloseTo(0, 6);
  });

  it("is prefix-stable (no look-ahead)", () => {
    assertPrefixStability(vwap, candles);
  });
});
