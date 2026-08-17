/**
 * Block 6 — Alpaca Trading API v2 client, PAPER ONLY.
 *
 * STRUCTURAL SAFETY GUARANTEE: `ALPACA_PAPER_TRADING_BASE_URL` below is the
 * ONLY base-URL-shaped constant anywhere in this file. There is no
 * environment variable, config field, or parameter — anywhere in this
 * file's public API — that can redirect a request to Alpaca's LIVE trading
 * endpoint. This is deliberate: unlike a runtime `if (isLive) ... else ...`
 * check (which a future edit could accidentally invert or bypass), a
 * hardcoded, unparameterized literal has no code path that reaches
 * anything else. `src/core/paper-trading/rs3m/safety-guards.ts` re-asserts
 * this constant's exact value at runtime before any write call, and
 * `tests/core/execution/alpaca-paper-client.test.ts` greps this file's own
 * source for the live domain to catch a regression even if someone adds a
 * NEW constant later.
 *
 * This is a completely separate module from
 * `src/core/market-data/providers/alpaca.adapter.ts` (Market Data API, read
 * only, different base URL, different auth scope) — deliberately not
 * sharing code with it, so a reviewer auditing "does this file have any
 * path to a live/money-moving endpoint" only ever needs to read this one
 * file in isolation.
 *
 * Used ONLY by the RS3M_CANDIDATE_V1 paper-trading path
 * (`src/core/paper-trading/rs3m/*`) — never by the Consensus/Signal Engine
 * pipeline, which has no execution path at all (see
 * `src/core/execution/types.ts`'s `ExecutionEngine`, which stays
 * unimplemented).
 */
import type { Result } from "@/core/shared/types";

// THE ONLY BASE-URL CONSTANT IN THIS FILE. Do not add another one; do not
// make this configurable via an environment variable or parameter.
const ALPACA_PAPER_TRADING_BASE_URL = "https://paper-api.alpaca.markets/v2";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

export interface AlpacaPaperTradingCredentials {
  keyId: string;
  secretKey: string;
}

export type TradingApiErrorCode = "PROVIDER_UNAVAILABLE" | "RATE_LIMITED" | "NOT_FOUND" | "REJECTED" | "UNKNOWN";

export interface TradingApiError {
  code: TradingApiErrorCode;
  message: string;
}

export interface AlpacaAccount {
  accountId: string;
  status: string;
  currency: string;
  cash: number;
  portfolioValue: number;
  equity: number;
  buyingPower: number;
  patternDayTrader: boolean;
  tradingBlocked: boolean;
  accountBlocked: boolean;
}

export interface AlpacaPosition {
  symbol: string;
  qty: number;
  side: "long" | "short";
  marketValue: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPl: number;
}

export interface AlpacaOrder {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  notional: number | undefined;
  qty: number | undefined;
  status: string;
  submittedAt: string;
  filledAt: string | undefined;
  filledAvgPrice: number | undefined;
  filledQty: number | undefined;
}

export interface SubmitNotionalOrderParams {
  symbol: string;
  side: "buy" | "sell";
  /** Dollar amount to buy/sell — notional orders avoid share-rounding and "unexpected fractional behavior" (see plan). Must be > 0. */
  notionalUsd: number;
  /**
   * Idempotency key Alpaca deduplicates client-side retries on. REQUIRED
   * (never auto-generated silently by this client) so every caller must
   * make a deliberate, traceable choice — `rs3m-engine.ts` derives this
   * from the rebalance month + asset + side, which is exactly what
   * `safety-guards.ts`'s duplicate-order protection also keys on.
   */
  clientOrderId: string;
}

export interface ListOrdersParams {
  status?: "open" | "closed" | "all";
  after?: string;
  until?: string;
  limit?: number;
}

interface AlpacaAccountResponse {
  id: string;
  status: string;
  currency: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  buying_power: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  account_blocked: boolean;
}

interface AlpacaPositionResponse {
  symbol: string;
  qty: string;
  side: string;
  market_value: string;
  avg_entry_price: string;
  current_price: string;
  unrealized_pl: string;
}

interface AlpacaOrderResponse {
  id: string;
  client_order_id: string;
  symbol: string;
  side: string;
  notional: string | null;
  qty: string | null;
  status: string;
  submitted_at: string;
  filled_at: string | null;
  filled_avg_price: string | null;
  filled_qty: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumberOrUndefined(value: string | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

async function alpacaTradingRequest<T>(
  method: "GET" | "POST",
  path: string,
  credentials: AlpacaPaperTradingCredentials,
  options: { query?: Record<string, string | undefined>; body?: Record<string, unknown> } = {},
): Promise<Result<T, TradingApiError>> {
  const url = new URL(`${ALPACA_PAPER_TRADING_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  let lastError: TradingApiError = { code: "UNKNOWN", message: "Alpaca Trading API request failed before any attempt completed." };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method,
        headers: {
          "APCA-API-KEY-ID": credentials.keyId,
          "APCA-API-SECRET-KEY": credentials.secretKey,
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (err) {
      lastError = { code: "PROVIDER_UNAVAILABLE", message: `Network error calling Alpaca Trading API: ${err instanceof Error ? err.message : String(err)}` };
      if (attempt < MAX_RETRIES) await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }

    if (response.status === 429) {
      lastError = { code: "RATE_LIMITED", message: "Alpaca Trading API rate limit exceeded (429)." };
      if (attempt < MAX_RETRIES) await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }
    if (response.status >= 500) {
      lastError = { code: "PROVIDER_UNAVAILABLE", message: `Alpaca Trading API returned ${response.status}.` };
      if (attempt < MAX_RETRIES) await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      continue;
    }
    if (response.status === 404) {
      return { ok: false, error: { code: "NOT_FOUND", message: `Alpaca Trading API returned 404 for ${path}.` } };
    }
    if (response.status === 422 || response.status === 403) {
      const body = await response.text();
      return { ok: false, error: { code: "REJECTED", message: `Alpaca Trading API rejected the request (${response.status}): ${body}` } };
    }
    if (!response.ok) {
      return { ok: false, error: { code: "UNKNOWN", message: `Alpaca Trading API returned unexpected status ${response.status}.` } };
    }

    const value = (await response.json()) as T;
    return { ok: true, value };
  }

  return { ok: false, error: lastError };
}

function mapAccount(raw: AlpacaAccountResponse): AlpacaAccount {
  return {
    accountId: raw.id,
    status: raw.status,
    currency: raw.currency,
    cash: Number(raw.cash),
    portfolioValue: Number(raw.portfolio_value),
    equity: Number(raw.equity),
    buyingPower: Number(raw.buying_power),
    patternDayTrader: raw.pattern_day_trader,
    tradingBlocked: raw.trading_blocked,
    accountBlocked: raw.account_blocked,
  };
}

function mapPosition(raw: AlpacaPositionResponse): AlpacaPosition {
  return {
    symbol: raw.symbol,
    qty: Number(raw.qty),
    side: raw.side === "short" ? "short" : "long",
    marketValue: Number(raw.market_value),
    avgEntryPrice: Number(raw.avg_entry_price),
    currentPrice: Number(raw.current_price),
    unrealizedPl: Number(raw.unrealized_pl),
  };
}

function mapOrder(raw: AlpacaOrderResponse): AlpacaOrder {
  return {
    orderId: raw.id,
    clientOrderId: raw.client_order_id,
    symbol: raw.symbol,
    side: raw.side === "sell" ? "sell" : "buy",
    notional: toNumberOrUndefined(raw.notional),
    qty: toNumberOrUndefined(raw.qty),
    status: raw.status,
    submittedAt: raw.submitted_at,
    filledAt: raw.filled_at ?? undefined,
    filledAvgPrice: toNumberOrUndefined(raw.filled_avg_price),
    filledQty: toNumberOrUndefined(raw.filled_qty),
  };
}

export interface AlpacaPaperTradingClient {
  getAccount(): Promise<Result<AlpacaAccount, TradingApiError>>;
  getPositions(): Promise<Result<AlpacaPosition[], TradingApiError>>;
  submitNotionalOrder(params: SubmitNotionalOrderParams): Promise<Result<AlpacaOrder, TradingApiError>>;
  getOrder(orderId: string): Promise<Result<AlpacaOrder, TradingApiError>>;
  listOrders(params?: ListOrdersParams): Promise<Result<AlpacaOrder[], TradingApiError>>;
}

/** Returns the exact base URL this client will ever call — exported so `safety-guards.ts` can re-assert it at runtime (defense in depth beyond this file's own structural guarantee). */
export function getAlpacaPaperTradingBaseUrl(): string {
  return ALPACA_PAPER_TRADING_BASE_URL;
}

export function createAlpacaPaperTradingClient(credentials: AlpacaPaperTradingCredentials): AlpacaPaperTradingClient {
  return {
    async getAccount() {
      const result = await alpacaTradingRequest<AlpacaAccountResponse>("GET", "/account", credentials);
      return result.ok ? { ok: true, value: mapAccount(result.value) } : result;
    },

    async getPositions() {
      const result = await alpacaTradingRequest<AlpacaPositionResponse[]>("GET", "/positions", credentials);
      return result.ok ? { ok: true, value: result.value.map(mapPosition) } : result;
    },

    async submitNotionalOrder(params: SubmitNotionalOrderParams) {
      if (!(params.notionalUsd > 0)) {
        return { ok: false, error: { code: "REJECTED", message: `notionalUsd must be > 0, got ${params.notionalUsd}.` } };
      }
      const result = await alpacaTradingRequest<AlpacaOrderResponse>("POST", "/orders", credentials, {
        body: {
          symbol: params.symbol,
          side: params.side,
          type: "market",
          time_in_force: "day",
          notional: params.notionalUsd.toFixed(2),
          client_order_id: params.clientOrderId,
        },
      });
      return result.ok ? { ok: true, value: mapOrder(result.value) } : result;
    },

    async getOrder(orderId: string) {
      const result = await alpacaTradingRequest<AlpacaOrderResponse>("GET", `/orders/${orderId}`, credentials);
      return result.ok ? { ok: true, value: mapOrder(result.value) } : result;
    },

    async listOrders(params: ListOrdersParams = {}) {
      const result = await alpacaTradingRequest<AlpacaOrderResponse[]>("GET", "/orders", credentials, {
        query: { status: params.status, after: params.after, until: params.until, limit: params.limit ? String(params.limit) : undefined },
      });
      return result.ok ? { ok: true, value: result.value.map(mapOrder) } : result;
    },
  };
}
