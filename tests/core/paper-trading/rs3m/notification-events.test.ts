import { describe, expect, it } from "vitest";
import { formatNotificationMessage, type Rs3mNotificationEvent } from "@/core/paper-trading/rs3m/notification-events";

describe("formatNotificationMessage", () => {
  it("includes the candidate tag, event type, and summary", () => {
    const event: Rs3mNotificationEvent = { type: "SIGNAL_GENERATED", timestamp: "2026-09-01T13:35:00Z", summary: "DOWJONES ranked #1", detail: {} };
    const message = formatNotificationMessage(event);
    expect(message).toContain("[RS3M_CANDIDATE_V1]");
    expect(message).toContain("SIGNAL_GENERATED");
    expect(message).toContain("DOWJONES ranked #1");
  });

  it("appends detail fields as key=value pairs", () => {
    const event: Rs3mNotificationEvent = { type: "GUARD_BLOCKED", timestamp: "2026-09-01T13:35:00Z", summary: "blocked", detail: { guard: "STALE_SIGNAL", decisionMonth: "2026-08" } };
    const message = formatNotificationMessage(event);
    expect(message).toContain("guard=STALE_SIGNAL");
    expect(message).toContain("decisionMonth=2026-08");
  });

  it("never includes a field literally named token/secret/key in a way that would leak credentials (detail is caller-controlled, but the formatter itself adds nothing sensitive)", () => {
    const event: Rs3mNotificationEvent = { type: "BROKER_ERROR", timestamp: "2026-09-01T13:35:00Z", summary: "Alpaca unavailable", detail: { code: "PROVIDER_UNAVAILABLE" } };
    const message = formatNotificationMessage(event);
    expect(message).not.toMatch(/APCA|secret|password/i);
  });
});
