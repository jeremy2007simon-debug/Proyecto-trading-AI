import { NextResponse } from "next/server";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { getRs3mExecutionSnapshot } from "@/novacore/execution-center/adapters/rs3m-execution-adapter";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";
import { getRs3mRiskSnapshot } from "@/novacore/risk-analytics/adapters/rs3m-risk-adapter";
import { getNovaCoreStrategyById } from "@/novacore/strategy-hub/registry";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";

const rateLimiter = createSlidingWindowRateLimiter(60_000, 60);

/**
 * Strategy detail — combines the Strategy Hub entry with its Execution
 * Center and Risk & Analytics snapshots and current health. Today only
 * `RS3M_CANDIDATE_V1` resolves; any other id is a real 404, never a
 * fabricated empty strategy.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimiter.isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const { id } = await params;
  const strategy = getNovaCoreStrategyById(id);
  if (!strategy) {
    return NextResponse.json({ error: `Unknown strategy id "${id}".` }, { status: 404 });
  }

  if (id !== RS3M_CANDIDATE_V1.candidateId) {
    return NextResponse.json({ strategy }, { status: 200 });
  }

  const [execution, risk, health] = await Promise.all([getRs3mExecutionSnapshot(), getRs3mRiskSnapshot(), getRs3mHealth()]);

  return NextResponse.json({ strategy, execution, risk, health });
}
