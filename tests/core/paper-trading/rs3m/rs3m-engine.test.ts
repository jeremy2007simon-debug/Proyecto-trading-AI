import { describe, expect, it, vi } from "vitest";
import { buildClientOrderId, createRs3mEngine, type Rs3mEngineDependencies } from "@/core/paper-trading/rs3m/rs3m-engine";
import type { AlpacaAccount, AlpacaOrder, AlpacaPaperTradingClient, AlpacaPosition } from "@/core/execution/alpaca-paper-client";
import type { RelativeStrengthAssetInput } from "@/core/backtesting/research/relative-strength";
import type { Candle } from "@/core/market-data/types";

function monthlyCandles(closes: readonly number[]): Candle[] {
  return closes.map((close, monthIndex) => ({
    market: "SP500",
    timeframe: "1d",
    symbol: "TEST",
    provider: "test",
    timestamp: new Date(Date.UTC(2026, monthIndex, 28, 20, 0, 0)).toISOString(),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000_000,
  }));
}

// 4 months of data (Jan-Apr 2026), lookback=3 -> exactly one decision point at April, ranking through April.
// SP500 wins clearly (up 20%), the others flat.
function buildUniverse(): RelativeStrengthAssetInput[] {
  return [
    { market: "SP500", candles: monthlyCandles([100, 105, 110, 120]) },
    { market: "NASDAQ100", candles: monthlyCandles([100, 100, 100, 100]) },
    { market: "RUSSELL2000", candles: monthlyCandles([100, 100, 100, 100]) },
    { market: "DOWJONES", candles: monthlyCandles([100, 100, 100, 100]) },
  ];
}

function account(overrides: Partial<AlpacaAccount> = {}): AlpacaAccount {
  return {
    accountId: "acct-1",
    status: "ACTIVE",
    currency: "USD",
    cash: 10000,
    portfolioValue: 10000,
    equity: 10000,
    buyingPower: 20000,
    patternDayTrader: false,
    tradingBlocked: false,
    accountBlocked: false,
    ...overrides,
  };
}

function order(overrides: Partial<AlpacaOrder> = {}): AlpacaOrder {
  return {
    orderId: "order-1",
    clientOrderId: "x",
    symbol: "SPY",
    side: "buy",
    notional: 10000,
    qty: undefined,
    status: "accepted",
    submittedAt: "2026-04-01T13:30:00Z",
    filledAt: undefined,
    filledAvgPrice: undefined,
    filledQty: undefined,
    ...overrides,
  };
}

function makeFakeClient(overrides: Partial<AlpacaPaperTradingClient> = {}): AlpacaPaperTradingClient {
  return {
    getAccount: vi.fn().mockResolvedValue({ ok: true, value: account() }),
    getPositions: vi.fn().mockResolvedValue({ ok: true, value: [] as AlpacaPosition[] }),
    submitNotionalOrder: vi.fn().mockResolvedValue({ ok: true, value: order() }),
    getOrder: vi.fn(),
    listOrders: vi.fn(),
    ...overrides,
  };
}

// One day after the decision month's data cutoff (2026-04-28) — the
// realistic "next trading session" scheduling window this engine is
// designed for, and far enough after the cutoff to never trip the
// STALE_SIGNAL guard's "future timestamp" check.
function makeDeps(overrides: Partial<Rs3mEngineDependencies> = {}): Rs3mEngineDependencies {
  return {
    tradingClient: makeFakeClient(),
    hasExecutedThisMonth: vi.fn().mockResolvedValue(false),
    nowIso: () => "2026-04-29T13:30:00Z",
    ...overrides,
  };
}

describe("buildClientOrderId", () => {
  it("is deterministic per (month, symbol, side)", () => {
    expect(buildClientOrderId("2026-04", "SPY", "buy")).toBe("rs3m-2026-04-spy-buy");
    expect(buildClientOrderId("2026-04", "SPY", "buy")).toBe(buildClientOrderId("2026-04", "SPY", "buy"));
  });
});

describe("createRs3mEngine — dryRun", () => {
  it("computes a full plan on a fresh (empty) account without calling submitNotionalOrder", async () => {
    const client = makeFakeClient();
    const engine = createRs3mEngine(makeDeps({ tradingClient: client }));

    const result = await engine.dryRun(buildUniverse());

    expect(result.signal?.selectedMarket).toBe("SP500");
    expect(result.plan?.orders).toEqual([{ symbol: "SPY", side: "buy", notionalUsd: 10000, reason: expect.any(String) }]);
    expect(result.wouldExecute).toBe(true);
    expect(client.submitNotionalOrder).not.toHaveBeenCalled();
  });

  it("blocks with NO_REBALANCE_NEEDED when the target asset is already held", async () => {
    const client = makeFakeClient({ getPositions: vi.fn().mockResolvedValue({ ok: true, value: [{ symbol: "SPY", qty: 20, side: "long", marketValue: 10000, avgEntryPrice: 490, currentPrice: 500, unrealizedPl: 200 }] }) });
    const engine = createRs3mEngine(makeDeps({ tradingClient: client }));

    const result = await engine.dryRun(buildUniverse());

    expect(result.wouldExecute).toBe(false);
    expect(result.blockedReason).toBe("NO_REBALANCE_NEEDED");
  });

  it("blocks via SAFETY_GUARD_FAILED when a rebalance for this month was already executed (idempotency)", async () => {
    const engine = createRs3mEngine(makeDeps({ hasExecutedThisMonth: vi.fn().mockResolvedValue(true) }));

    const result = await engine.dryRun(buildUniverse());

    expect(result.wouldExecute).toBe(false);
    expect(result.blockedReason).toBe("SAFETY_GUARD_FAILED");
    expect(result.guardResult.violations.some((v) => v.guard === "IDEMPOTENCY")).toBe(true);
  });

  it("blocks via SAFETY_GUARD_FAILED when the signal is stale relative to 'now'", async () => {
    // "Now" is 30 days after the signal's data cutoff.
    const engine = createRs3mEngine(makeDeps({ nowIso: () => "2026-05-30T13:30:00Z" }));

    const result = await engine.dryRun(buildUniverse());

    expect(result.wouldExecute).toBe(false);
    expect(result.guardResult.violations.some((v) => v.guard === "STALE_SIGNAL")).toBe(true);
  });

  it("returns INSUFFICIENT_DATA when there isn't enough history for the candidate's lookback", async () => {
    const shortUniverse: RelativeStrengthAssetInput[] = [
      { market: "SP500", candles: monthlyCandles([100, 105]) },
      { market: "NASDAQ100", candles: monthlyCandles([100, 100]) },
      { market: "RUSSELL2000", candles: monthlyCandles([100, 100]) },
      { market: "DOWJONES", candles: monthlyCandles([100, 100]) },
    ];
    const engine = createRs3mEngine(makeDeps());

    const result = await engine.dryRun(shortUniverse);

    expect(result.signal).toBeUndefined();
    expect(result.blockedReason).toBe("INSUFFICIENT_DATA");
  });

  it("returns ACCOUNT_UNAVAILABLE when the trading client's getAccount call fails", async () => {
    const client = makeFakeClient({ getAccount: vi.fn().mockResolvedValue({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "down" } }) });
    const engine = createRs3mEngine(makeDeps({ tradingClient: client }));

    const result = await engine.dryRun(buildUniverse());

    expect(result.blockedReason).toBe("ACCOUNT_UNAVAILABLE");
  });
});

describe("createRs3mEngine — execute", () => {
  it("submits the planned orders when the dry-run plan would execute", async () => {
    const submitMock = vi.fn().mockResolvedValue({ ok: true, value: order({ clientOrderId: "rs3m-2026-04-spy-buy" }) });
    const client = makeFakeClient({ submitNotionalOrder: submitMock });
    const engine = createRs3mEngine(makeDeps({ tradingClient: client }));

    const result = await engine.execute(buildUniverse());

    expect(result.skipped).toBe(false);
    expect(result.ordersSubmitted).toHaveLength(1);
    expect(submitMock).toHaveBeenCalledWith({ symbol: "SPY", side: "buy", notionalUsd: 10000, clientOrderId: "rs3m-2026-04-spy-buy" });
  });

  it("does NOT submit any order when the plan would not execute (e.g. already executed this month)", async () => {
    const submitMock = vi.fn();
    const client = makeFakeClient({ submitNotionalOrder: submitMock });
    const engine = createRs3mEngine(makeDeps({ tradingClient: client, hasExecutedThisMonth: vi.fn().mockResolvedValue(true) }));

    const result = await engine.execute(buildUniverse());

    expect(result.skipped).toBe(true);
    expect(result.ordersSubmitted).toEqual([]);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("stops and reports if an order submission fails, without pretending later orders succeeded", async () => {
    const client = makeFakeClient({
      getPositions: vi.fn().mockResolvedValue({ ok: true, value: [{ symbol: "QQQ", qty: 10, side: "long", marketValue: 10000, avgEntryPrice: 900, currentPrice: 1000, unrealizedPl: 1000 }] }),
      submitNotionalOrder: vi.fn().mockResolvedValueOnce({ ok: false, error: { code: "REJECTED", message: "insufficient buying power" } }),
    });
    const engine = createRs3mEngine(makeDeps({ tradingClient: client }));

    const result = await engine.execute(buildUniverse());

    expect(result.skipped).toBe(true);
    expect(result.ordersSubmitted).toEqual([]);
    expect(result.skipReason).toContain("insufficient buying power");
  });
});
