import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getMarketNews } from "@/novacore/market-news/adapters/get-market-news";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";

const querySchema = z.object({
  category: z
    .enum(["FED_RATES", "INFLATION", "EMPLOYMENT", "GDP", "TREASURY_YIELDS", "GEOPOLITICS", "TRADE_TARIFFS", "EARNINGS", "TECHNOLOGY", "FINANCIAL_SECTOR", "ENERGY", "REGULATION", "VOLATILITY", "SYSTEMIC_RISK", "GENERAL"])
    .optional(),
  market: z.enum(["SP500", "NASDAQ100", "DOWJONES", "RUSSELL2000"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
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

  const news = await getMarketNews(parsed.data);
  return NextResponse.json(news);
}
