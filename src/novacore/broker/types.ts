import type { HealthStatus, Result } from "@/novacore/shared/types";

/**
 * Broker abstraction (Block 7, section 14). Today the only implementation
 * is `alpaca-paper-broker-adapter.ts`, a READ-ONLY wrapper around the
 * existing, unmodified `AlpacaPaperTradingClient`
 * (`src/core/execution/alpaca-paper-client.ts`). Deliberately shaped so a
 * future MT5/prop-firm broker adapter can implement the same interface
 * without any NovaCore consumer code changing — but no such adapter is
 * built in this block (see the Block 7 "not doing" list).
 *
 * `BrokerAdapter` intentionally has no order-submission method: NovaCore
 * is observability-first (Block 7 principle 26/33) and never gives the
 * dashboard/API layer a code path that can place, modify, or cancel an
 * order. Order submission remains exclusively `rs3m-engine.ts#execute()`,
 * gated by the existing safety guards and approval flow.
 */

export interface BrokerAccountSnapshot {
  accountId: string;
  currency: string;
  cash: number;
  portfolioValue: number;
  equity: number;
  buyingPower: number;
  tradingBlocked: boolean;
  accountBlocked: boolean;
}

export interface BrokerPositionSnapshot {
  symbol: string;
  qty: number;
  side: "long" | "short";
  marketValue: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPl: number;
  /** unrealizedPl / cost basis * 100 — computed here (not by the broker), never re-derived from a stale/cached price. undefined only if cost basis is 0. */
  unrealizedPlPct: number | undefined;
}

export interface BrokerOrderSnapshot {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  status: string;
  submittedAt: string;
  filledAt?: string;
  filledQty?: number;
  filledAvgPrice?: number;
}

export interface BrokerError {
  code: string;
  message: string;
}

export interface BrokerHealth {
  status: HealthStatus;
  credentialsConfigured: boolean;
  detail: string;
}

/**
 * Read-only broker contract. Every method here is a read; no
 * implementation of this interface may expose a write/order-submission
 * capability — that stays entirely inside the Block 6 RS3M engine, which
 * this interface does not touch or wrap.
 */
export interface BrokerAdapter {
  readonly id: string;
  readonly environment: "PAPER" | "LIVE";

  getAccount(): Promise<Result<BrokerAccountSnapshot, BrokerError>>;
  getPositions(): Promise<Result<BrokerPositionSnapshot[], BrokerError>>;
  getOrders(): Promise<Result<BrokerOrderSnapshot[], BrokerError>>;
  getHealth(): Promise<BrokerHealth>;
}
