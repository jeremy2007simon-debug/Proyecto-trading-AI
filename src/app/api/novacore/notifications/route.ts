import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { buildNovaCoreNotifications } from "@/novacore/notifications/build-notifications";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
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

  const notifications = await buildNovaCoreNotifications({ limit: parsed.data.limit });
  return NextResponse.json({ notifications });
}
