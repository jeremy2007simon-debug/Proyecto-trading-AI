import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildNovaCoreNotifications } from "@/novacore/notifications/build-notifications";

describe("buildNovaCoreNotifications", () => {
  const originalKeyId = process.env.ALPACA_PAPER_API_KEY_ID;
  const originalSecret = process.env.ALPACA_PAPER_API_SECRET_KEY;

  beforeEach(() => {
    delete process.env.ALPACA_PAPER_API_KEY_ID;
    delete process.env.ALPACA_PAPER_API_SECRET_KEY;
  });

  afterEach(() => {
    if (originalKeyId === undefined) delete process.env.ALPACA_PAPER_API_KEY_ID;
    else process.env.ALPACA_PAPER_API_KEY_ID = originalKeyId;
    if (originalSecret === undefined) delete process.env.ALPACA_PAPER_API_SECRET_KEY;
    else process.env.ALPACA_PAPER_API_SECRET_KEY = originalSecret;
  });

  it("resolves without throwing and returns an array", async () => {
    const notifications = await buildNovaCoreNotifications();
    expect(Array.isArray(notifications)).toBe(true);
  });

  it("surfaces an unconfigured-credentials health check as IMPORTANT, never CRITICAL — an expected absence is not an emergency", async () => {
    const notifications = await buildNovaCoreNotifications();
    const credentialsNotification = notifications.find((n) => n.id === "health:Credentials configured");
    expect(credentialsNotification).toBeDefined();
    expect(credentialsNotification?.priority).toBe("IMPORTANT");
    expect(credentialsNotification?.category).toBe("SYSTEM");
  });

  it("never claims approval is required or execution is blocked when no signal has ever been computed", async () => {
    const notifications = await buildNovaCoreNotifications();
    expect(notifications.find((n) => n.id === "safety:approval-required")).toBeUndefined();
    expect(notifications.find((n) => n.id === "safety:blocked")).toBeUndefined();
  });

  it("sorts CRITICAL/IMPORTANT ahead of INFO", async () => {
    const notifications = await buildNovaCoreNotifications();
    const rank = { CRITICAL: 3, IMPORTANT: 2, INFO: 1 } as const;
    for (let i = 1; i < notifications.length; i++) {
      expect(rank[notifications[i - 1].priority]).toBeGreaterThanOrEqual(rank[notifications[i].priority]);
    }
  });

  it("respects the limit option", async () => {
    const notifications = await buildNovaCoreNotifications({ limit: 1 });
    expect(notifications.length).toBeLessThanOrEqual(1);
  });
});
