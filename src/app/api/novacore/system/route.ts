import { NextResponse } from "next/server";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";

const rateLimiter = createSlidingWindowRateLimiter(60_000, 60);

/**
 * Block 7 — NovaCore system status. GET-only, like every route under
 * `/api/novacore/**`: this API surface has no POST/PUT/DELETE anywhere,
 * a structural guarantee (not just a UI convention) that nothing behind
 * it can place an order, approve a rebalance, or change a strategy's
 * status. Never returns credential values — only whether they're
 * configured (see `BrokerHealth`).
 */
export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimiter.isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const rs3mHealth = await getRs3mHealth();

  return NextResponse.json({
    system: "NovaCore Trading Lab",
    status: "ONLINE",
    liveTradingEnabled: false,
    strategies: [{ id: "RS3M_CANDIDATE_V1", health: rs3mHealth }],
  });
}
