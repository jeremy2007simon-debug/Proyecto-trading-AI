import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET as getActivity } from "@/app/api/novacore/activity/route";
import { GET as getExecution } from "@/app/api/novacore/execution/route";
import { GET as getChart } from "@/app/api/novacore/market/chart/route";
import { GET as getMovers } from "@/app/api/novacore/market/movers/route";
import { GET as getNews } from "@/app/api/novacore/market/news/route";
import { GET as getSpy } from "@/app/api/novacore/market/spy/route";
import { GET as getNotifications } from "@/app/api/novacore/notifications/route";
import { GET as getPortfolio } from "@/app/api/novacore/portfolio/route";
import { GET as getResearch } from "@/app/api/novacore/research/route";
import { GET as getRisk } from "@/app/api/novacore/risk/route";
import { GET as getStrategies } from "@/app/api/novacore/strategies/route";
import { GET as getStrategyById } from "@/app/api/novacore/strategies/[id]/route";
import { GET as getSystem } from "@/app/api/novacore/system/route";

/**
 * Block 7 — API layer smoke tests. Every route under `/api/novacore/**`
 * is GET-only by construction (no route.ts here exports POST/PUT/DELETE
 * — see `read-only-guarantees.test.ts` for the static check on the
 * adapters those routes call); these tests confirm each one actually
 * resolves and returns a well-formed, secret-free JSON body.
 */

function req(url: string): Request {
  return new Request(url);
}

describe("/api/novacore/* — read-only API layer", () => {
  it("GET /api/novacore/system", async () => {
    const res = await getSystem(req("http://localhost/api/novacore/system"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.system).toBe("NovaCore Trading Lab");
    expect(body.liveTradingEnabled).toBe(false);
  });

  it("GET /api/novacore/portfolio", async () => {
    const res = await getPortfolio(req("http://localhost/api/novacore/portfolio"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.available).toBe("boolean");
  });

  it("GET /api/novacore/strategies", async () => {
    const res = await getStrategies(req("http://localhost/api/novacore/strategies"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Block 10 adds CA_CANDIDATE_V1 as the second registered strategy — RS3M stays first.
    expect(body.strategies.length).toBeGreaterThanOrEqual(2);
    expect(body.strategies[0].id).toBe("RS3M_CANDIDATE_V1");
    expect(body.strategies.map((s: { id: string }) => s.id)).toContain("CA_CANDIDATE_V1");
  });

  it("GET /api/novacore/strategies/RS3M_CANDIDATE_V1", async () => {
    const res = await getStrategyById(req("http://localhost/api/novacore/strategies/RS3M_CANDIDATE_V1"), { params: Promise.resolve({ id: "RS3M_CANDIDATE_V1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.strategy.id).toBe("RS3M_CANDIDATE_V1");
    expect(body.execution).toBeDefined();
    expect(body.risk).toBeDefined();
    expect(body.health).toBeDefined();
  });

  it("GET /api/novacore/strategies/:id — 404 for an unknown strategy", async () => {
    const res = await getStrategyById(req("http://localhost/api/novacore/strategies/NOT_REAL"), { params: Promise.resolve({ id: "NOT_REAL" }) });
    expect(res.status).toBe(404);
  });

  it("GET /api/novacore/research", async () => {
    const res = await getResearch(req("http://localhost/api/novacore/research"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects.length).toBeGreaterThanOrEqual(2);
  });

  it("GET /api/novacore/execution", async () => {
    const res = await getExecution(req("http://localhost/api/novacore/execution"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.strategies[0].strategyId).toBe("RS3M_CANDIDATE_V1");
  });

  it("GET /api/novacore/risk", async () => {
    const res = await getRisk(req("http://localhost/api/novacore/risk"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.strategies[0].strategyMetrics.cagrPct).toBeCloseTo(17.24, 1);
  });

  it("GET /api/novacore/activity with a domain filter", async () => {
    const res = await getActivity(new NextRequest("http://localhost/api/novacore/activity?domain=research"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events.every((e: { domain: string }) => e.domain === "research")).toBe(true);
  });

  it("GET /api/novacore/activity rejects an invalid domain", async () => {
    const res = await getActivity(new NextRequest("http://localhost/api/novacore/activity?domain=not-a-domain"));
    expect(res.status).toBe(400);
  });

  it("GET /api/novacore/market/spy", async () => {
    const res = await getSpy(new NextRequest("http://localhost/api/novacore/market/spy?timeframe=1M"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticker).toBe("SPY");
    expect(body.timeframe).toBe("1M");
    expect(typeof body.available).toBe("boolean");
  });

  it("GET /api/novacore/market/spy rejects an invalid timeframe", async () => {
    const res = await getSpy(new NextRequest("http://localhost/api/novacore/market/spy?timeframe=5Y"));
    expect(res.status).toBe(400);
  });

  it("GET /api/novacore/market/chart", async () => {
    const res = await getChart(new NextRequest("http://localhost/api/novacore/market/chart?market=NASDAQ100&timeframe=1M"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.market).toBe("NASDAQ100");
    expect(body.ticker).toBe("QQQ");
  });

  it("GET /api/novacore/market/chart rejects an invalid market", async () => {
    const res = await getChart(new NextRequest("http://localhost/api/novacore/market/chart?market=BITCOIN"));
    expect(res.status).toBe(400);
  });

  it("GET /api/novacore/market/movers", async () => {
    const res = await getMovers(new NextRequest("http://localhost/api/novacore/market/movers"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movers).toHaveLength(4);
  });

  it("GET /api/novacore/market/news", async () => {
    const res = await getNews(new NextRequest("http://localhost/api/novacore/market/news"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.available).toBe("boolean");
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("GET /api/novacore/market/news rejects an invalid category", async () => {
    const res = await getNews(new NextRequest("http://localhost/api/novacore/market/news?category=NOT_REAL"));
    expect(res.status).toBe(400);
  });

  it("GET /api/novacore/notifications", async () => {
    const res = await getNotifications(new NextRequest("http://localhost/api/novacore/notifications"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.notifications)).toBe(true);
  });

  it("no route module in src/app/api/novacore exports POST/PUT/DELETE/PATCH", async () => {
    const modules = [
      await import("@/app/api/novacore/system/route"),
      await import("@/app/api/novacore/portfolio/route"),
      await import("@/app/api/novacore/strategies/route"),
      await import("@/app/api/novacore/strategies/[id]/route"),
      await import("@/app/api/novacore/research/route"),
      await import("@/app/api/novacore/execution/route"),
      await import("@/app/api/novacore/risk/route"),
      await import("@/app/api/novacore/activity/route"),
      await import("@/app/api/novacore/market/spy/route"),
      await import("@/app/api/novacore/market/chart/route"),
      await import("@/app/api/novacore/market/movers/route"),
      await import("@/app/api/novacore/market/news/route"),
      await import("@/app/api/novacore/notifications/route"),
    ];
    for (const mod of modules) {
      const exported = mod as unknown as Record<string, unknown>;
      expect(exported.POST).toBeUndefined();
      expect(exported.PUT).toBeUndefined();
      expect(exported.DELETE).toBeUndefined();
      expect(exported.PATCH).toBeUndefined();
    }
  });
});
