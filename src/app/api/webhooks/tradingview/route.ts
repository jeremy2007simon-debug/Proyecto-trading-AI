import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

/**
 * Inbound TradingView alert webhook — SKELETON ONLY.
 *
 * This endpoint authenticates and validates the payload and returns it
 * back, but does NOT persist it, does NOT feed it into the Strategy
 * Manager, and does NOT place any order. Wiring it into the real
 * pipeline (writing to `strategy_signals`, triggering the Consensus
 * Engine) is deliberately left for a later delivery, once a real
 * Market Data Engine exists to cross-check alerts against.
 *
 * Security measures already in place:
 *  - Shared-secret authentication via the `X-Webhook-Secret` header,
 *    compared with a constant-time check.
 *  - Strict payload validation (zod) — malformed/unexpected payloads are
 *    rejected with 400, never partially processed.
 *  - A minimal in-memory rate limit per source IP, to blunt abuse. This
 *    is process-local and resets on redeploy; a production deployment
 *    should move this to a shared store (e.g. Supabase or Redis) once
 *    the app runs on more than one instance.
 */

const tradingViewAlertSchema = z.object({
  market: z.enum(["SP500", "NASDAQ100", "FOREX_EURUSD", "GOLD", "BITCOIN"]),
  timeframe: z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]),
  signal: z.enum(["BUY", "SELL", "WAIT"]),
  price: z.number().finite().positive(),
  timestamp: z.string().datetime({ offset: true }),
  strategyId: z.string().min(1).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX_REQUESTS;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(request: NextRequest) {
  const secret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook not configured on this deployment." },
      { status: 503 },
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const providedSecret = request.headers.get("x-webhook-secret") ?? "";
  if (!timingSafeEqual(providedSecret, secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = tradingViewAlertSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // NOTE: intentionally not persisted or forwarded to the Strategy
  // Manager / Consensus Engine yet — see module docstring above.
  console.info("[tradingview-webhook] accepted alert (not processed)", {
    market: parsed.data.market,
    timeframe: parsed.data.timeframe,
    signal: parsed.data.signal,
  });

  return NextResponse.json({ received: true, processed: false });
}
