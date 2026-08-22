import { describe, expect, it } from "vitest";
import { runR3bIndependentReproduction, R3B_ORIGINAL_CONFIG, type R3bBarInput } from "@/core/r3b-verification/independent-reproduction";

/**
 * Block 8.4 §1, §28 — unit tests for the independent reproduction
 * module itself (distinct from the full-history comparison script,
 * which is the primary evidence but isn't a unit test). Covers
 * determinism, the documented regime-warmup divergence, and basic
 * sanity on the entry/exit state machine's own construction.
 */
function makeFlatBars(days: number, price = 100): R3bBarInput[] {
  return Array.from({ length: days }, (_, i) => ({ date: new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10), adjClose: price }));
}

describe("runR3bIndependentReproduction — determinism", () => {
  it("running twice on identical input produces byte-identical output", () => {
    const bars = makeFlatBars(300).map((b, i) => ({ ...b, adjClose: 100 + Math.sin(i / 10) * 5 }));
    const a = runR3bIndependentReproduction(bars, R3B_ORIGINAL_CONFIG);
    const b = runR3bIndependentReproduction(bars, R3B_ORIGINAL_CONFIG);
    expect(a).toEqual(b);
  });
});

describe("runR3bIndependentReproduction — basic sanity", () => {
  it("a perfectly flat price series never enters a position (no RSI dip-and-resume ever occurs)", () => {
    const bars = makeFlatBars(400);
    const result = runR3bIndependentReproduction(bars, R3B_ORIGINAL_CONFIG);
    expect(result.trades).toHaveLength(0);
    expect(result.daily.every((d) => !d.inPosition)).toBe(true);
  });

  it("cash days (flat position) always realize exactly 0% net return", () => {
    const bars = makeFlatBars(300).map((b, i) => ({ ...b, adjClose: 100 + Math.sin(i / 7) * 8 }));
    const result = runR3bIndependentReproduction(bars, R3B_ORIGINAL_CONFIG);
    for (const d of result.daily) {
      // `0 * negativeReturn` can produce JS's `-0`, which is mathematically zero but fails Object.is-based `toBe(0)` — compare numerically instead.
      if (!d.inPosition && d.costDrag === 0) expect(d.netReturn === 0 || Object.is(d.netReturn, -0)).toBe(true);
    }
  });

  it("every trade's exit reason is one of the three documented possibilities", () => {
    const bars = makeFlatBars(600).map((b, i) => ({ ...b, adjClose: 100 + Math.sin(i / 9) * 12 + i * 0.05 }));
    const result = runR3bIndependentReproduction(bars, R3B_ORIGINAL_CONFIG);
    for (const t of result.trades) {
      expect(["RSI_TARGET", "TREND_BREAK", "MAX_HOLD"]).toContain(t.exitReason);
      expect(t.holdDays).toBeGreaterThan(0);
      expect(t.holdDays).toBeLessThanOrEqual(R3B_ORIGINAL_CONFIG.maxHoldDays);
    }
  });
});

describe("runR3bIndependentReproduction — regime SMA period is a genuine independent parameter", () => {
  it("changing regimeSmaPeriod changes trading behavior (proving the parameter is actually wired through, not silently ignored)", () => {
    // A downtrend for the first third, then a sustained uptrend with repeated dip-and-recover cycles (to actually trigger RSI oversold-then-resume entries), long enough for both a 20-day and a 300-day SMA to diverge meaningfully in whether price sits above/below each.
    const bars: R3bBarInput[] = [];
    let price = 200;
    for (let i = 0; i < 900; i++) {
      if (i < 300) price *= 0.999; // decline
      else {
        const cyclePos = (i - 300) % 40;
        price *= cyclePos < 8 ? 0.985 : 1.008; // sharp dip then recovery, repeated
      }
      bars.push({ date: new Date(Date.UTC(2000, 0, 1 + i)).toISOString().slice(0, 10), adjClose: price });
    }
    const short = runR3bIndependentReproduction(bars, { ...R3B_ORIGINAL_CONFIG, regimeSmaPeriod: 20 });
    const long = runR3bIndependentReproduction(bars, { ...R3B_ORIGINAL_CONFIG, regimeSmaPeriod: 300 });
    expect(short.daily.length).toBe(long.daily.length);
    // At minimum, the two configurations must diverge somewhere (different trade count or different daily position flags) — a regime-period change with this much price-path variation cannot be a total no-op.
    const positionsDiffer = short.daily.some((d, i) => d.inPosition !== long.daily[i].inPosition);
    expect(short.trades.length !== long.trades.length || positionsDiffer).toBe(true);
  });
});
