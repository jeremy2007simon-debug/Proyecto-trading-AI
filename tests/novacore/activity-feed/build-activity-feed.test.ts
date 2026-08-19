import { describe, expect, it } from "vitest";
import { buildActivityFeed } from "@/novacore/activity-feed/build-activity-feed";

describe("NovaCore Activity Feed", () => {
  it("merges events from every registered adapter", () => {
    const events = buildActivityFeed();
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.domain === "research")).toBe(true);
    expect(events.some((e) => e.domain === "strategy")).toBe(true);
  });

  it("sorts events newest-first", () => {
    const events = buildActivityFeed();
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].timestamp >= events[i].timestamp).toBe(true);
    }
  });

  it("filters by domain", () => {
    const events = buildActivityFeed({ domain: "research" });
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.domain).toBe("research");
    }
  });

  it("respects the limit option", () => {
    const events = buildActivityFeed({ limit: 1 });
    expect(events.length).toBeLessThanOrEqual(1);
  });

  it("never includes a credential-shaped field on any event", () => {
    const events = buildActivityFeed();
    const serialized = JSON.stringify(events).toLowerCase();
    expect(serialized).not.toMatch(/secretkey|apca-api-secret/);
  });
});
