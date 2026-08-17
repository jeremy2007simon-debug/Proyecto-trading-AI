import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createRuleBasedDataQualityEngine } from "@/core/data-quality/rule-based-data-quality-engine";
import { toMarketDataValidFlag } from "@/core/data-quality/types";
import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import { createNyseCalendar } from "@/core/market-hours/nyse-calendar";
import { upsertCandles } from "@/lib/data/market-candles.repository";
import { logDataQualityReport } from "@/lib/data/data-quality-log";
import { createSlidingWindowRateLimiter } from "@/lib/security/rate-limiter";
import { timingSafeEqual } from "@/lib/security/timing-safe-equal";
import { marketQuerySchema } from "@/lib/validation/market-query";

/**
 * Pulls historical candles from the configured provider, runs the Data
 * Quality Engine, and upserts into `market_candles` when quality isn't
 * FAIL. Intended to be called by an external scheduler (e.g. Vercel
 * Cron) — scheduling itself is a deployment concern, out of scope here.
 */

const ingestBodySchema = marketQuerySchema.extend({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }).optional(),
});

const rateLimiter = createSlidingWindowRateLimiter(60_000, 10);

export async function POST(request: NextRequest) {
  const secret = process.env.MARKET_DATA_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Ingestion endpoint not configured on this deployment." },
      { status: 503 },
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimiter.isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const providedSecret = request.headers.get("x-ingest-secret") ?? "";
  if (!timingSafeEqual(providedSecret, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = ingestBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { market, timeframe, from, to } = parsed.data;

  const providerResult = createMarketDataProvider();
  if (!providerResult.ok) {
    return NextResponse.json({ error: providerResult.error.message }, { status: 503 });
  }

  const candlesResult = await providerResult.value.getHistoricalCandles({
    market,
    timeframe,
    from,
    to,
  });
  if (!candlesResult.ok) {
    return NextResponse.json({ error: candlesResult.error.message }, { status: 502 });
  }
  const candles = candlesResult.value;

  const calendar = createNyseCalendar(market);
  const report = createRuleBasedDataQualityEngine().evaluate(candles, {
    market,
    timeframe,
    calendar,
    now: new Date(),
  });

  try {
    await logDataQualityReport(report);
  } catch (err) {
    console.error("[market-data/ingest] failed to log data quality report", err);
  }

  if (!toMarketDataValidFlag(report)) {
    return NextResponse.json(
      { inserted: 0, report, error: "Data quality FAIL — nothing was written." },
      { status: 422 },
    );
  }

  const { inserted } = await upsertCandles(candles);

  return NextResponse.json({ inserted, report });
}
