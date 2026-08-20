import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getMarketBenchmarkSeries } from "@/novacore/market-context/adapters/market-benchmark-adapter";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";

const querySchema = z.object({
  market: z.enum(["SP500", "NASDAQ100", "DOWJONES", "RUSSELL2000"]).default("SP500"),
  timeframe: z.enum(["1D", "1W", "1M", "3M", "1Y", "ALL"]).default("1M"),
});

const rateLimiter = createSlidingWindowRateLimiter(60_000, 60);

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimiter.isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters.", issues: parsed.error.issues }, { status: 400 });
  }

  const series = await getMarketBenchmarkSeries(parsed.data.market, parsed.data.timeframe);
  return NextResponse.json(series);
}
