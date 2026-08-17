import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConsoleAdapter } from "../../../../scripts/block6/paper/notifications/console-adapter";
import { createTelegramAdapter } from "../../../../scripts/block6/paper/notifications/telegram-adapter";
import { createNotificationDispatcher } from "../../../../scripts/block6/paper/notifications/dispatcher";
import type { NotificationAdapter } from "../../../../scripts/block6/paper/notifications/adapter";
import type { Rs3mNotificationEvent } from "@/core/paper-trading/rs3m/notification-events";

const event: Rs3mNotificationEvent = { type: "SIGNAL_GENERATED", timestamp: "2026-09-01T13:35:00Z", summary: "DOWJONES ranked #1", detail: {} };

describe("createConsoleAdapter", () => {
  it("logs the formatted message to console.log", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const adapter = createConsoleAdapter();
    await adapter.send(event);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("SIGNAL_GENERATED"));
    logSpy.mockRestore();
  });
});

describe("createTelegramAdapter", () => {
  it("returns undefined (disabled) when TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing — never blocks the system", () => {
    expect(createTelegramAdapter({})).toBeUndefined();
    expect(createTelegramAdapter({ TELEGRAM_BOT_TOKEN: "x" })).toBeUndefined();
    expect(createTelegramAdapter({ TELEGRAM_CHAT_ID: "y" })).toBeUndefined();
  });

  it("returns a configured adapter when both env vars are present", () => {
    const adapter = createTelegramAdapter({ TELEGRAM_BOT_TOKEN: "fake-token", TELEGRAM_CHAT_ID: "12345" });
    expect(adapter).toBeDefined();
    expect(adapter!.name).toBe("telegram");
  });

  describe("send()", () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => vi.unstubAllGlobals());

    it("posts to the Telegram API with the bot token in the URL, never logged elsewhere", async () => {
      const adapter = createTelegramAdapter({ TELEGRAM_BOT_TOKEN: "fake-token", TELEGRAM_CHAT_ID: "12345" })!;
      await adapter.send(event);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.telegram.org/botfake-token/sendMessage");
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.chat_id).toBe("12345");
      expect(String(body.text)).toContain("SIGNAL_GENERATED");
    });

    it("logs an error (without leaking the token) and does not throw when the Telegram API rejects the request", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const adapter = createTelegramAdapter({ TELEGRAM_BOT_TOKEN: "fake-token", TELEGRAM_CHAT_ID: "12345" })!;

      await expect(adapter.send(event)).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
      const loggedText = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(loggedText).not.toContain("fake-token");
      errorSpy.mockRestore();
    });

    it("catches a network error and never throws", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const adapter = createTelegramAdapter({ TELEGRAM_BOT_TOKEN: "fake-token", TELEGRAM_CHAT_ID: "12345" })!;

      await expect(adapter.send(event)).resolves.toBeUndefined();
      errorSpy.mockRestore();
    });
  });
});

describe("createNotificationDispatcher", () => {
  it("fans an event out to every adapter", async () => {
    const a = { name: "a", send: vi.fn().mockResolvedValue(undefined) } satisfies NotificationAdapter;
    const b = { name: "b", send: vi.fn().mockResolvedValue(undefined) } satisfies NotificationAdapter;
    const dispatcher = createNotificationDispatcher([a, b]);

    await dispatcher.notify(event);

    expect(a.send).toHaveBeenCalledWith(event);
    expect(b.send).toHaveBeenCalledWith(event);
  });

  it("isolates one adapter's failure — the other adapter still runs and notify() never throws", async () => {
    const broken = { name: "broken", send: vi.fn().mockRejectedValue(new Error("boom")) } satisfies NotificationAdapter;
    const healthy = { name: "healthy", send: vi.fn().mockResolvedValue(undefined) } satisfies NotificationAdapter;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dispatcher = createNotificationDispatcher([broken, healthy]);

    await expect(dispatcher.notify(event)).resolves.toBeUndefined();

    expect(healthy.send).toHaveBeenCalledWith(event);
    errorSpy.mockRestore();
  });

  it("works fine with zero adapters (e.g. before any channel is configured)", async () => {
    const dispatcher = createNotificationDispatcher([]);
    await expect(dispatcher.notify(event)).resolves.toBeUndefined();
  });
});
