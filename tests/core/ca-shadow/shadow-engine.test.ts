import { describe, expect, it } from "vitest";
import { evaluateShadowDay, INITIAL_SHADOW_STATE, EXPECTED_CA_DATA_ADJUSTMENT, type ShadowPriorState } from "@/core/ca-shadow/shadow-engine";
import type { CanonicalCaSignalPoint } from "@/core/ca-shadow/canonical-signal";
import { EXPECTED_CA_CANDIDATE_V1_HASH } from "@/core/ca-shadow/candidate";

/** 260 mildly-positive trading days, so the trailing-252 window is always full ("sufficient history") without any day itself triggering the bottom-decile signal. */
function baselinePoints(days = 260): CanonicalCaSignalPoint[] {
  const points: CanonicalCaSignalPoint[] = [];
  let price = 100;
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
    points.push({ date, close: price });
    price *= 1 + (i % 7 === 0 ? -0.001 : 0.0015); // small, non-extreme wobble
  }
  return points;
}

/** Appends one more day with an extreme negative return, guaranteed to fall in the bottom decile of the mild baseline distribution above — deterministically triggers the signal. */
function withTriggerDay(points: readonly CanonicalCaSignalPoint[]): CanonicalCaSignalPoint[] {
  const last = points[points.length - 1];
  const nextDate = new Date(new Date(`${last.date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  return [...points, { date: nextDate, close: last.close * 0.5 }]; // -50% — far below any realistic bottom decile
}

/** Appends one more ordinary (mildly positive) day — never triggers. */
function withOrdinaryDay(points: readonly CanonicalCaSignalPoint[]): CanonicalCaSignalPoint[] {
  const last = points[points.length - 1];
  const nextDate = new Date(new Date(`${last.date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  return [...points, { date: nextDate, close: last.close * 1.002 }];
}

const NOW = "2020-09-20T21:00:00.000Z"; // well after 260 trading days from 2020-01-01

describe("Block 10 §6/§10/§11 — shadow-engine execution timing, fills, and costs", () => {
  it("enters on the trigger day at that day's close, charging cost upfront with zero price P&L on entry", () => {
    const points = withTriggerDay(baselinePoints());
    const { dayResult, newState } = evaluateShadowDay({ points, priorState: INITIAL_SHADOW_STATE, nowIso: NOW, dataSource: "test", dataCutoffIso: NOW, dataAdjustment: EXPECTED_CA_DATA_ADJUSTMENT });

    expect(dayResult.guardResult.passed).toBe(true);
    expect(dayResult.signal?.triggered).toBe(true);
    expect(dayResult.decision).toBe("ENTER");
    expect(dayResult.positionBefore).toBe("FLAT");
    expect(dayResult.positionAfter).toBe("LONG");
    expect(dayResult.hypotheticalFillPrice).toBe(points[points.length - 1].close);
    expect(dayResult.theoreticalPrice).toBe(dayResult.hypotheticalFillPrice); // §11: no optimistic slippage — reference price = fill price
    expect(dayResult.dailyPnlPct).toBeCloseTo(-dayResult.costFraction, 12); // entry day P&L is exactly -cost, no price return
    expect(dayResult.costBps).toBeGreaterThan(0);
    expect(newState.position).toBe("LONG");
    expect(newState.entryPrice).toBe(dayResult.hypotheticalFillPrice);
    expect(newState.lastProcessedDate).toBe(dayResult.date);
  });

  it("exits unconditionally the next processed day, realizing the full close-to-close return", () => {
    const entryPoints = withTriggerDay(baselinePoints());
    const { newState: afterEntry } = evaluateShadowDay({ points: entryPoints, priorState: INITIAL_SHADOW_STATE, nowIso: NOW, dataSource: "test", dataCutoffIso: NOW, dataAdjustment: EXPECTED_CA_DATA_ADJUSTMENT });

    const exitPoints = withOrdinaryDay(entryPoints);
    const { dayResult, newState } = evaluateShadowDay({ points: exitPoints, priorState: afterEntry, nowIso: NOW, dataSource: "test", dataCutoffIso: NOW, dataAdjustment: EXPECTED_CA_DATA_ADJUSTMENT });

    const entryPrice = afterEntry.entryPrice!;
    const exitPrice = exitPoints[exitPoints.length - 1].close;
    expect(dayResult.decision).toBe("EXIT");
    expect(dayResult.positionBefore).toBe("LONG");
    expect(dayResult.positionAfter).toBe("FLAT");
    expect(dayResult.dailyPnlPct).toBeCloseTo(exitPrice / entryPrice - 1, 12);
    expect(newState.position).toBe("FLAT");
    expect(newState.entryPrice).toBeUndefined();
  });

  it("HOLD_FLAT on an untriggered day while flat: no position change, zero P&L", () => {
    const points = withOrdinaryDay(baselinePoints());
    const { dayResult, newState } = evaluateShadowDay({ points, priorState: INITIAL_SHADOW_STATE, nowIso: NOW, dataSource: "test", dataCutoffIso: NOW, dataAdjustment: EXPECTED_CA_DATA_ADJUSTMENT });

    expect(dayResult.signal?.triggered).toBe(false);
    expect(dayResult.decision).toBe("HOLD_FLAT");
    expect(dayResult.positionAfter).toBe("FLAT");
    expect(dayResult.dailyPnlPct).toBe(0);
    expect(newState.shadowEquity).toBe(INITIAL_SHADOW_STATE.shadowEquity);
  });
});

describe("Block 10 §14/§27 — shadow-engine safety guards block and never update position", () => {
  it("blocks on a wrong/tampered candidate hash and leaves position untouched", () => {
    const points = withTriggerDay(baselinePoints());
    const priorState: ShadowPriorState = { ...INITIAL_SHADOW_STATE, position: "LONG", entryPrice: 42, entryDate: "2020-01-01" };
    const { dayResult, newState } = evaluateShadowDay({ points, priorState, nowIso: NOW, dataSource: "test", dataCutoffIso: NOW, dataAdjustment: EXPECTED_CA_DATA_ADJUSTMENT, candidateHashOverride: "deadbeef" });

    expect(dayResult.decision).toBe("BLOCKED");
    expect(dayResult.guardResult.passed).toBe(false);
    expect(dayResult.guardResult.violations.map((v) => v.guard)).toContain("CANDIDATE_HASH_MISMATCH");
    expect(dayResult.positionAfter).toBe("LONG"); // unchanged — §14: "si falla, no actualizar posición"
    expect(newState).toEqual(priorState);
  });

  it("blocks a duplicate run on an already-processed date (idempotency) and never double-enters", () => {
    const points = withTriggerDay(baselinePoints());
    const todayDate = points[points.length - 1].date;
    const priorState: ShadowPriorState = { ...INITIAL_SHADOW_STATE, lastProcessedDate: todayDate };
    const { dayResult, newState } = evaluateShadowDay({ points, priorState, nowIso: NOW, dataSource: "test", dataCutoffIso: NOW, dataAdjustment: EXPECTED_CA_DATA_ADJUSTMENT });

    expect(dayResult.decision).toBe("BLOCKED");
    expect(dayResult.guardResult.violations.map((v) => v.guard)).toContain("DUPLICATE_DATE");
    expect(dayResult.positionAfter).toBe(priorState.position);
    expect(newState).toEqual(priorState);
  });

  it("blocks on stale data (data cutoff far older than now)", () => {
    const points = withTriggerDay(baselinePoints());
    const staleCutoff = "2019-01-01T00:00:00.000Z";
    const { dayResult } = evaluateShadowDay({ points, priorState: INITIAL_SHADOW_STATE, nowIso: NOW, dataSource: "test", dataCutoffIso: staleCutoff, dataAdjustment: EXPECTED_CA_DATA_ADJUSTMENT });

    expect(dayResult.decision).toBe("BLOCKED");
    expect(dayResult.guardResult.violations.map((v) => v.guard)).toContain("DATA_STALE");
  });

  it("blocks on insufficient trailing history (fewer than 252 usable returns)", () => {
    const points = withTriggerDay(baselinePoints(60));
    const { dayResult } = evaluateShadowDay({ points, priorState: INITIAL_SHADOW_STATE, nowIso: NOW, dataSource: "test", dataCutoffIso: NOW, dataAdjustment: EXPECTED_CA_DATA_ADJUSTMENT });

    expect(dayResult.decision).toBe("BLOCKED");
    expect(dayResult.guardResult.violations.map((v) => v.guard)).toContain("INSUFFICIENT_HISTORY");
  });

  it("blocks on an adjustment-convention mismatch", () => {
    const points = withTriggerDay(baselinePoints());
    const { dayResult } = evaluateShadowDay({ points, priorState: INITIAL_SHADOW_STATE, nowIso: NOW, dataSource: "test", dataCutoffIso: NOW, dataAdjustment: "UNADJUSTED_CLOSE" });

    expect(dayResult.decision).toBe("BLOCKED");
    expect(dayResult.guardResult.violations.map((v) => v.guard)).toContain("ADJUSTMENT_MISMATCH");
    expect(dayResult.positionAfter).toBe("FLAT");
  });

  it("passes with the exact pinned CA_CANDIDATE_V1 hash — proves the pinned constant and the live-computed hash still agree", () => {
    const points = withOrdinaryDay(baselinePoints());
    const { dayResult } = evaluateShadowDay({ points, priorState: INITIAL_SHADOW_STATE, nowIso: NOW, dataSource: "test", dataCutoffIso: NOW, dataAdjustment: EXPECTED_CA_DATA_ADJUSTMENT });

    expect(dayResult.candidateHash).toBe(EXPECTED_CA_CANDIDATE_V1_HASH);
    expect(dayResult.guardResult.violations.map((v) => v.guard)).not.toContain("CANDIDATE_HASH_MISMATCH");
  });
});
