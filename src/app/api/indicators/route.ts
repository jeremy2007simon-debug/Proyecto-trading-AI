import { NextResponse, type NextRequest } from "next/server";
import { getMarketOverview } from "@/lib/data/market-overview.server";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";
import { marketQuerySchema } from "@/lib/validation/market-query";

const rateLimiter = createSlidingWindowRateLimiter(60_000, 60);

/** Latest computed indicator snapshot for a market/timeframe. Never falls back to mock data. */
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimiter.isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const parsed = marketQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { market, timeframe } = parsed.data;

  const overview = await getMarketOverview(market, timeframe);
  if (!overview.ok) {
    return NextResponse.json({ available: false, reason: overview.error.reason }, { status: 503 });
  }

  return NextResponse.json({
    available: true,
    market,
    timeframe,
    lastUpdated: overview.value.lastUpdated,
    provider: overview.value.provider,
    indicators: overview.value.indicators,
  });
}
