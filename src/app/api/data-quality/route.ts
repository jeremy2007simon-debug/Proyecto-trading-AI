import { NextResponse, type NextRequest } from "next/server";
import { getMarketOverview } from "@/lib/data/market-overview.server";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";
import { marketQuerySchema } from "@/lib/validation/market-query";

const rateLimiter = createSlidingWindowRateLimiter(60_000, 60);

/**
 * Latest Data Quality Report for a market/timeframe. Unlike the other
 * endpoints, this one still returns a body (with `available: false`)
 * when the quality check itself failed, so a caller can see *why* —
 * only a fully unconfigured/unreachable provider returns 503 with no report.
 */
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
  if (overview.ok) {
    return NextResponse.json({
      available: true,
      market,
      timeframe,
      dataQuality: overview.value.dataQuality,
    });
  }

  if (overview.error.dataQuality) {
    return NextResponse.json({
      available: false,
      reason: overview.error.reason,
      market,
      timeframe,
      dataQuality: overview.error.dataQuality,
    });
  }

  return NextResponse.json({ available: false, reason: overview.error.reason }, { status: 503 });
}
