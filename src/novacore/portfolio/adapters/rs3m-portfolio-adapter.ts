import "server-only";

import { createAlpacaPaperBrokerAdapter } from "@/novacore/broker/alpaca-paper-broker-adapter";
import type { NovaCorePortfolioSnapshot } from "@/novacore/portfolio/types";

const RECENT_ORDERS_LIMIT = 10;

/**
 * Block 7 / Observability Upgrade — READ-ONLY portfolio snapshot, aggregated
 * from the (only) `BrokerAdapter` today. Attempts live reads of the Alpaca
 * PAPER account/positions/orders; when credentials aren't configured or a
 * call fails, returns `available: false` with the reason rather than
 * fabricating equity/cash/position numbers. `recentOrders` comes from
 * `BrokerAdapter#getOrders()` (a read — this file never references
 * `submitNotionalOrder` or any write path).
 */
export async function getNovaCorePortfolioSnapshot(): Promise<NovaCorePortfolioSnapshot> {
  const broker = createAlpacaPaperBrokerAdapter();
  const [accountResult, positionsResult, ordersResult] = await Promise.all([broker.getAccount(), broker.getPositions(), broker.getOrders()]);

  if (!accountResult.ok) {
    return {
      accounts: [],
      positions: [],
      recentOrders: [],
      totalEquity: 0,
      totalCash: 0,
      strategiesCount: 1,
      available: false,
      unavailableReason: accountResult.error.message,
      sourceOfTruth: { account: "Alpaca PAPER API (live read, unavailable)" },
    };
  }

  const account = accountResult.value;
  const positions = positionsResult.ok ? positionsResult.value : [];
  const orders = ordersResult.ok ? ordersResult.value : [];
  const lastSyncedAt = new Date().toISOString();

  const recentOrders = [...orders]
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .slice(0, RECENT_ORDERS_LIMIT)
    .map((o) => ({ orderId: o.orderId, symbol: o.symbol, side: o.side, status: o.status, submittedAt: o.submittedAt, filledAt: o.filledAt, filledQty: o.filledQty, filledAvgPrice: o.filledAvgPrice }));

  return {
    accounts: [{ broker: broker.id, accountId: account.accountId, environment: broker.environment, cash: account.cash, equity: account.equity, buyingPower: account.buyingPower }],
    positions: positions.map((p) => ({
      strategyId: "RS3M_CANDIDATE_V1",
      symbol: p.symbol,
      qty: p.qty,
      marketValue: p.marketValue,
      avgEntryPrice: p.avgEntryPrice,
      currentPrice: p.currentPrice,
      unrealizedPl: p.unrealizedPl,
      unrealizedPlPct: p.unrealizedPlPct,
    })),
    recentOrders,
    totalEquity: account.equity,
    totalCash: account.cash,
    strategiesCount: 1,
    available: true,
    lastSyncedAt,
    sourceOfTruth: {
      account: "Alpaca PAPER API (live read)",
      positions: "Alpaca PAPER API (live read)",
      recentOrders: "Alpaca PAPER API (live read, BrokerAdapter#getOrders — read-only)",
    },
  };
}
