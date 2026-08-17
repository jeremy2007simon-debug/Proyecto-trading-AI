import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getRegimeHistory } from "@/lib/data/market-regimes.repository";
import { getMarketOverview } from "@/lib/data/market-overview.server";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";
import { marketQuerySchema } from "@/lib/validation/market-query";

const querySchema = marketQuerySchema.extend({
  history: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

const rateLimiter = createSlidingWindowRateLimiter(60_000, 60);

/**
 * Current regime (live detection) by default, or persisted history
 * (`?history=true`) read from `market_regimes`. Never falls back to
 * mock data — an unconfigured/failing provider returns 503, not a
 * synthetic regime.
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimiter.isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { market, timeframe, history, limit } = parsed.data;

  if (history) {
    const rows = await getRegimeHistory(market, timeframe, limit);
    return NextResponse.json({ market, timeframe, history: rows });
  }

  const overview = await getMarketOverview(market, timeframe);
  if (!overview.ok) {
    return NextResponse.json({ available: false, reason: overview.error.reason }, { status: 503 });
  }

  return NextResponse.json({ available: true, market, timeframe, regime: overview.value.regime });
}
