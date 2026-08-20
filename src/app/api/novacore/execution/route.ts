import { NextResponse } from "next/server";
import { getRs3mExecutionSnapshot } from "@/novacore/execution-center/adapters/rs3m-execution-adapter";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";

const rateLimiter = createSlidingWindowRateLimiter(60_000, 60);

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimiter.isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  return NextResponse.json({ strategies: [await getRs3mExecutionSnapshot()] });
}
