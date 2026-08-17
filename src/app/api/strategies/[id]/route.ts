import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getStrategyDetail } from "@/lib/data/strategy-signals.server";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";
import { marketQuerySchema } from "@/lib/validation/market-query";

const querySchema = marketQuerySchema.extend({
  limit: z.coerce.number().int().positive().max(200).default(50),
});

const rateLimiter = createSlidingWindowRateLimiter(60_000, 60);

/**
 * Detail for a single strategy: static registration metadata, its
 * signal from the current live evaluation (same call as `/api/strategies`
 * under the hood, so the two stay consistent), and its persisted signal
 * history. 404 for an unregistered `id`. No profitability metrics — no
 * real backtests exist yet.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const { market, timeframe, limit } = parsed.data;
  const { id } = await params;

  const detail = await getStrategyDetail(id, market, timeframe, limit);
  if (!detail.ok) {
    return NextResponse.json({ error: detail.error.reason }, { status: 404 });
  }

  return NextResponse.json({ market, timeframe, ...detail.value });
}
