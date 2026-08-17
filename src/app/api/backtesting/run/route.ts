import { NextResponse, type NextRequest } from "next/server";
import { runSingleStrategyBacktest } from "@/lib/data/backtest.server";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";
import { backtestRunRequestSchema, toBacktestConfig } from "@/lib/validation/backtest-config";

// Backtests are computationally heavier than the live-evaluation routes
// (a full candle range simulated bar-by-bar) — a tighter limit than the
// 60/min used by /api/strategies is deliberate.
const rateLimiter = createSlidingWindowRateLimiter(60_000, 10);

/**
 * Runs a single-strategy backtest synchronously and returns the full
 * result in one response — this is a research tool over historical
 * data, not a production order path, so there is no job queue. Never
 * optimizes or adjusts the request's parameters; whatever the caller
 * asks for is exactly what gets simulated, wins or losses included
 * (point 28 — no automatic tuning anywhere in this path).
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimiter.isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = backtestRunRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid backtest configuration.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const config = toBacktestConfig(parsed.data);
  const result = await runSingleStrategyBacktest(config);

  if (!result.ok) {
    return NextResponse.json(
      { available: false, reason: result.error.reason, dataQuality: result.error.dataQuality },
      { status: 503 },
    );
  }

  return NextResponse.json({ available: true, ...result.value });
}
