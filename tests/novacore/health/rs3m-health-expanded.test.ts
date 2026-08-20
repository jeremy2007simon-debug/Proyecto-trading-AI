import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";

describe("getRs3mHealth — expanded checks (Observability Upgrade)", () => {
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

  it("includes every check the Observability Upgrade brief asked for", async () => {
    const health = await getRs3mHealth();
    const names = health.checks.map((c) => c.name);
    for (const expected of ["NovaCore API", "Candidate hash integrity", "Paper broker connectivity", "Credentials configured", "Forward evidence", "Market data freshness", "Routine (documented)"]) {
      expect(names).toContain(expected);
    }
  });

  it("does not escalate an expected absence of credentials into ERROR", async () => {
    const health = await getRs3mHealth();
    const credCheck = health.checks.find((c) => c.name === "Credentials configured");
    const brokerCheck = health.checks.find((c) => c.name === "Paper broker connectivity");
    expect(credCheck?.status).not.toBe("ERROR");
    expect(brokerCheck?.status).not.toBe("ERROR");
  });

  it("every check carries a short explanation, never a bare status with no context", async () => {
    const health = await getRs3mHealth();
    for (const check of health.checks) {
      expect(check.detail.length).toBeGreaterThan(0);
    }
  });
});
