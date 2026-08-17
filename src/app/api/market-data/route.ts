import { NextResponse, type NextRequest } from "next/server";
import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";
import { marketQuerySchema } from "@/lib/validation/market-query";
import { z } from "zod";

const querySchema = marketQuerySchema.extend({
  limit: z.coerce.number().int().positive().max(5000).default(500),
  lookbackDays: z.coerce.number().positive().max(30).default(5),
});

const rateLimiter = createSlidingWindowRateLimiter(60_000, 60);

/** Live historical candles from the configured MarketDataProvider. Never falls back to mock data. */
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
  const { market, timeframe, limit, lookbackDays } = parsed.data;

  const providerResult = createMarketDataProvider();
  if (!providerResult.ok) {
    return NextResponse.json({ error: providerResult.error.message }, { status: 503 });
  }

  const now = new Date();
  const candlesResult = await providerResult.value.getHistoricalCandles({
    market,
    timeframe,
    from: new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000).toISOString(),
    to: now.toISOString(),
    limit,
  });
  if (!candlesResult.ok) {
    return NextResponse.json({ error: candlesResult.error.message }, { status: 502 });
  }

  return NextResponse.json({
    market,
    timeframe,
    provider: providerResult.value.id,
    count: candlesResult.value.length,
    candles: candlesResult.value,
  });
}
