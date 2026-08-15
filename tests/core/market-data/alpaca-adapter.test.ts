import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlpacaMarketDataProvider } from "@/core/market-data/providers/alpaca.adapter";

const credentials = { keyId: "test-key", secretKey: "test-secret" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createAlpacaMarketDataProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("maps the internal timeframe to Alpaca's format and follows next_page_token pagination", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          bars: [{ t: "2024-06-17T13:30:00Z", o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }],
          symbol: "SPY",
          next_page_token: "page2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          bars: [{ t: "2024-06-17T13:35:00Z", o: 1.5, h: 2.5, l: 1, c: 2, v: 200 }],
          symbol: "SPY",
          next_page_token: null,
        }),
      );

    const provider = createAlpacaMarketDataProvider(credentials);
    const result = await provider.getHistoricalCandles({
      market: "SP500",
      timeframe: "5m",
      from: "2024-06-17T13:30:00Z",
      to: "2024-06-17T13:40:00Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.value).toHaveLength(2);
    expect(result.value[0].symbol).toBe("SPY");
    expect(result.value[0].provider).toBe("alpaca");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(firstUrl.searchParams.get("timeframe")).toBe("5Min");
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(secondUrl.searchParams.get("page_token")).toBe("page2");
  });

  it("maps a 404 response to a NO_DATA error without retrying", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "not found" }, 404));

    const provider = createAlpacaMarketDataProvider(credentials);
    const result = await provider.getLatestCandle("SP500", "5m");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error.code).toBe("NO_DATA");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 5xx responses with backoff, exhausts retries as PROVIDER_UNAVAILABLE, and never leaks credentials", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "boom" }, 500));
    vi.useFakeTimers();

    const provider = createAlpacaMarketDataProvider({
      keyId: "SECRET_ID",
      secretKey: "SECRET_KEY",
    });
    const resultPromise = provider.getCurrentPrice("SP500");
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(result.error.message).not.toContain("SECRET_ID");
    expect(result.error.message).not.toContain("SECRET_KEY");
    expect(fetchMock).toHaveBeenCalledTimes(4); // MAX_RETRIES (3) + initial attempt
  });

  it("sends the Alpaca auth headers on every request", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ symbol: "SPY", trade: { t: "2024-06-17T13:30:00Z", p: 542.1 } }),
    );

    const provider = createAlpacaMarketDataProvider(credentials);
    await provider.getCurrentPrice("SP500");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["APCA-API-KEY-ID"]).toBe("test-key");
    expect(headers["APCA-API-SECRET-KEY"]).toBe("test-secret");
  });
});
