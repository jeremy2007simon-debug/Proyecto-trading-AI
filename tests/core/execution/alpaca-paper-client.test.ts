import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlpacaPaperTradingClient, getAlpacaPaperTradingBaseUrl } from "@/core/execution/alpaca-paper-client";

const credentials = { keyId: "test-key", secretKey: "test-secret" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("alpaca-paper-client — structural paper-only guarantee", () => {
  it("getAlpacaPaperTradingBaseUrl() returns exactly the Alpaca PAPER endpoint", () => {
    expect(getAlpacaPaperTradingBaseUrl()).toBe("https://paper-api.alpaca.markets/v2");
  });

  it("the client's OWN SOURCE FILE contains no reference to Alpaca's LIVE trading domain — a regression here means someone added a new path to a live endpoint", () => {
    const source = readFileSync(join(process.cwd(), "src/core/execution/alpaca-paper-client.ts"), "utf8");
    expect(source).not.toContain("https://api.alpaca.markets");
    // Guards against a sneaky partial/concatenated live URL too (e.g. building it from a prefix + suffix).
    expect(source.replace(/paper-api/g, "")).not.toContain("api.alpaca.markets");
  });

  it("the source file defines exactly one base-URL-shaped constant", () => {
    const source = readFileSync(join(process.cwd(), "src/core/execution/alpaca-paper-client.ts"), "utf8");
    const matches = source.match(/https:\/\/[a-zA-Z0-9.-]+\.alpaca\.markets/g) ?? [];
    expect(new Set(matches)).toEqual(new Set(["https://paper-api.alpaca.markets"]));
  });
});

describe("createAlpacaPaperTradingClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("getAccount() calls the paper base URL and maps the Alpaca account shape", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "acct-1",
        status: "ACTIVE",
        currency: "USD",
        cash: "10000.50",
        portfolio_value: "12000.75",
        equity: "12000.75",
        buying_power: "20000",
        pattern_day_trader: false,
        trading_blocked: false,
        account_blocked: false,
      }),
    );

    const client = createAlpacaPaperTradingClient(credentials);
    const result = await client.getAccount();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.cash).toBe(10000.5);
    expect(result.value.equity).toBe(12000.75);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl.startsWith("https://paper-api.alpaca.markets/v2/account")).toBe(true);
  });

  it("getPositions() maps an array of positions", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { symbol: "SPY", qty: "10", side: "long", market_value: "5000", avg_entry_price: "490", current_price: "500", unrealized_pl: "100" },
      ]),
    );

    const client = createAlpacaPaperTradingClient(credentials);
    const result = await client.getPositions();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toHaveLength(1);
    expect(result.value[0].symbol).toBe("SPY");
    expect(result.value[0].side).toBe("long");
  });

  it("submitNotionalOrder() sends a market/day notional order with the given client_order_id", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "order-1",
        client_order_id: "rs3m-2026-08-spy-buy",
        symbol: "SPY",
        side: "buy",
        notional: "1000.00",
        qty: null,
        status: "accepted",
        submitted_at: "2026-08-03T13:30:00Z",
        filled_at: null,
        filled_avg_price: null,
        filled_qty: null,
      }),
    );

    const client = createAlpacaPaperTradingClient(credentials);
    const result = await client.submitNotionalOrder({ symbol: "SPY", side: "buy", notionalUsd: 1000, clientOrderId: "rs3m-2026-08-spy-buy" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.status).toBe("accepted");
    expect(result.value.clientOrderId).toBe("rs3m-2026-08-spy-buy");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://paper-api.alpaca.markets/v2/orders");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.type).toBe("market");
    expect(body.time_in_force).toBe("day");
    expect(body.notional).toBe("1000.00");
    expect(body.client_order_id).toBe("rs3m-2026-08-spy-buy");
  });

  it("submitNotionalOrder() rejects a non-positive notional WITHOUT calling fetch", async () => {
    const client = createAlpacaPaperTradingClient(credentials);
    const result = await client.submitNotionalOrder({ symbol: "SPY", side: "buy", notionalUsd: 0, clientOrderId: "x" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error.code).toBe("REJECTED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a 422 response to REJECTED (Alpaca's own order-rejection status)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "insufficient buying power" }, 422));

    const client = createAlpacaPaperTradingClient(credentials);
    const result = await client.submitNotionalOrder({ symbol: "SPY", side: "buy", notionalUsd: 1000, clientOrderId: "x" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error.code).toBe("REJECTED");
  });

  it("retries 5xx responses with backoff and exhausts to PROVIDER_UNAVAILABLE, never leaking credentials", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "boom" }, 500));
    vi.useFakeTimers();

    const client = createAlpacaPaperTradingClient({ keyId: "SECRET_ID", secretKey: "SECRET_KEY" });
    const resultPromise = client.getAccount();
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(result.error.message).not.toContain("SECRET_ID");
    expect(result.error.message).not.toContain("SECRET_KEY");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("getOrder() maps a 404 to NOT_FOUND", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "not found" }, 404));

    const client = createAlpacaPaperTradingClient(credentials);
    const result = await client.getOrder("nonexistent");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error.code).toBe("NOT_FOUND");
  });

  it("listOrders() passes filters as query params and maps the array", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: "o1", client_order_id: "c1", symbol: "SPY", side: "buy", notional: "1000", qty: null, status: "filled", submitted_at: "t", filled_at: "t2", filled_avg_price: "500", filled_qty: "2" },
      ]),
    );

    const client = createAlpacaPaperTradingClient(credentials);
    const result = await client.listOrders({ status: "closed", limit: 10 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toHaveLength(1);
    expect(result.value[0].filledAvgPrice).toBe(500);

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("status")).toBe("closed");
    expect(url.searchParams.get("limit")).toBe("10");
  });

  it("sends the Alpaca auth headers on every request", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    const client = createAlpacaPaperTradingClient(credentials);
    await client.getPositions();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["APCA-API-KEY-ID"]).toBe("test-key");
    expect(headers["APCA-API-SECRET-KEY"]).toBe("test-secret");
  });
});
