import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { buildActivityFeed } from "@/novacore/activity-feed/build-activity-feed";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";

const querySchema = z.object({
  domain: z.enum(["research", "strategy", "execution", "system"]).optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
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

  const { domain, limit } = parsed.data;
  return NextResponse.json({ events: buildActivityFeed({ domain, limit }) });
}
