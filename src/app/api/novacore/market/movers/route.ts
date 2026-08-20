import { NextResponse, type NextRequest } from "next/server";
import { getMarketMovers } from "@/novacore/market-context/adapters/market-movers-adapter";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";

const rateLimiter = createSlidingWindowRateLimiter(60_000, 60);

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimiter.isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const movers = await getMarketMovers();
  return NextResponse.json({ movers });
}
