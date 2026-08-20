import "server-only";

import { createAlpacaPaperTradingClient, type AlpacaPaperTradingClient } from "@/core/execution/alpaca-paper-client";
import { resolveAlpacaPaperCredentials } from "../../../scripts/block6/paper/credentials";
import type { BrokerAccountSnapshot, BrokerAdapter, BrokerError, BrokerHealth, BrokerOrderSnapshot, BrokerPositionSnapshot } from "@/novacore/broker/types";
import type { Result } from "@/novacore/shared/types";

/**
 * Block 7 — READ-ONLY `BrokerAdapter` for RS3M's Alpaca PAPER account.
 * Wraps `createAlpacaPaperTradingClient` (unmodified, Block 6) and only
 * ever calls its read methods (`getAccount`, `getPositions`,
 * `listOrders`). This file has no reference to `submitNotionalOrder`
 * anywhere — a NovaCore consumer of `BrokerAdapter` has no way to place
 * an order even if it wanted to, because the interface itself doesn't
 * expose one (see `types.ts`'s doc comment).
 *
 * Credentials are resolved server-side only (`resolveAlpacaPaperCredentials`,
 * unmodified from Block 6) and never returned to any caller — `getHealth()`
 * reports only whether credentials are CONFIGURED, never their value.
 * When credentials are absent (the current state of this environment —
 * see `docs/BLOCK6_CANDIDATE_VERIFICATION_REPORT.md` section 21), every
 * method fails closed with a typed error instead of throwing or
 * fabricating data.
 */

function toBrokerError(error: { code: string; message: string }): BrokerError {
  return { code: error.code, message: error.message };
}

/** Cost basis (avgEntryPrice * qty) can be 0 for a just-opened, zero-notional edge case — return undefined rather than dividing by zero or fabricating 0%. */
function unrealizedPlPct(avgEntryPrice: number, qty: number, unrealizedPl: number): number | undefined {
  const costBasis = Math.abs(avgEntryPrice * qty);
  if (costBasis === 0) return undefined;
  return (unrealizedPl / costBasis) * 100;
}

const MISSING_CREDENTIALS_ERROR: BrokerError = {
  code: "CREDENTIALS_NOT_CONFIGURED",
  message: "ALPACA_PAPER_API_KEY_ID/ALPACA_PAPER_API_SECRET_KEY are not configured in this environment.",
};

function getClient(): AlpacaPaperTradingClient | undefined {
  const credentials = resolveAlpacaPaperCredentials();
  if (!credentials) return undefined;
  return createAlpacaPaperTradingClient(credentials);
}

export function createAlpacaPaperBrokerAdapter(): BrokerAdapter {
  return {
    id: "alpaca-paper",
    environment: "PAPER",

    async getAccount(): Promise<Result<BrokerAccountSnapshot, BrokerError>> {
      const client = getClient();
      if (!client) return { ok: false, error: MISSING_CREDENTIALS_ERROR };
      const result = await client.getAccount();
      if (!result.ok) return { ok: false, error: toBrokerError(result.error) };
      const a = result.value;
      return {
        ok: true,
        value: {
          accountId: a.accountId,
          currency: a.currency,
          cash: a.cash,
          portfolioValue: a.portfolioValue,
          equity: a.equity,
          buyingPower: a.buyingPower,
          tradingBlocked: a.tradingBlocked,
          accountBlocked: a.accountBlocked,
        },
      };
    },

    async getPositions(): Promise<Result<BrokerPositionSnapshot[], BrokerError>> {
      const client = getClient();
      if (!client) return { ok: false, error: MISSING_CREDENTIALS_ERROR };
      const result = await client.getPositions();
      if (!result.ok) return { ok: false, error: toBrokerError(result.error) };
      return {
        ok: true,
        value: result.value.map((p) => ({
          symbol: p.symbol,
          qty: p.qty,
          side: p.side,
          marketValue: p.marketValue,
          avgEntryPrice: p.avgEntryPrice,
          currentPrice: p.currentPrice,
          unrealizedPl: p.unrealizedPl,
          unrealizedPlPct: unrealizedPlPct(p.avgEntryPrice, p.qty, p.unrealizedPl),
        })),
      };
    },

    async getOrders(): Promise<Result<BrokerOrderSnapshot[], BrokerError>> {
      const client = getClient();
      if (!client) return { ok: false, error: MISSING_CREDENTIALS_ERROR };
      const result = await client.listOrders({ status: "all" });
      if (!result.ok) return { ok: false, error: toBrokerError(result.error) };
      return {
        ok: true,
        value: result.value.map((o) => ({
          orderId: o.orderId,
          symbol: o.symbol,
          side: o.side,
          status: o.status,
          submittedAt: o.submittedAt,
          filledAt: o.filledAt,
          filledQty: o.filledQty,
          filledAvgPrice: o.filledAvgPrice,
        })),
      };
    },

    async getHealth(): Promise<BrokerHealth> {
      const credentialsConfigured = resolveAlpacaPaperCredentials() !== undefined;
      if (!credentialsConfigured) {
        return { status: "WARNING", credentialsConfigured: false, detail: "Alpaca PAPER credentials are not configured — broker connectivity cannot be verified." };
      }
      return { status: "HEALTHY", credentialsConfigured: true, detail: "Alpaca PAPER credentials configured." };
    },
  };
}
