import { describe, expect, it } from "vitest";
import { combineHealth } from "@/novacore/health/aggregator";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";
import type { HealthCheck } from "@/novacore/shared/types";

describe("NovaCore health aggregator", () => {
  it("returns HEALTHY when every check is HEALTHY", () => {
    const checks: HealthCheck[] = [
      { name: "a", status: "HEALTHY", detail: "" },
      { name: "b", status: "HEALTHY", detail: "" },
    ];
    expect(combineHealth(checks).status).toBe("HEALTHY");
  });

  it("returns the single worst status among all checks", () => {
    const checks: HealthCheck[] = [
      { name: "a", status: "HEALTHY", detail: "" },
      { name: "b", status: "WARNING", detail: "" },
      { name: "c", status: "ERROR", detail: "" },
      { name: "d", status: "DEGRADED", detail: "" },
    ];
    expect(combineHealth(checks).status).toBe("ERROR");
  });

  it("treats an empty check list as OFFLINE rather than defaulting to HEALTHY", () => {
    expect(combineHealth([]).status).toBe("OFFLINE");
  });

  it("preserves every individual check in the summary", () => {
    const checks: HealthCheck[] = [{ name: "a", status: "WARNING", detail: "d" }];
    expect(combineHealth(checks).checks).toEqual(checks);
  });
});

describe("NovaCore health — RS3M is health, not performance", () => {
  it("computes a health summary independently of any performance metric", async () => {
    const health = await getRs3mHealth();
    expect(health.checks.length).toBeGreaterThan(0);
    expect(["HEALTHY", "WARNING", "DEGRADED", "ERROR", "OFFLINE"]).toContain(health.status);
    // Candidate hash integrity must always be checked and must pass, regardless of the strategy's OOS performance.
    const hashCheck = health.checks.find((c) => c.name === "Candidate hash integrity");
    expect(hashCheck?.status).toBe("HEALTHY");
  });
});
