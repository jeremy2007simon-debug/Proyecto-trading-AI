import "server-only";

import { createAlpacaPaperBrokerAdapter } from "@/novacore/broker/alpaca-paper-broker-adapter";
import type { NovaCorePortfolioSnapshot } from "@/novacore/portfolio/types";

/**
 * Block 7 — READ-ONLY portfolio snapshot, aggregated from the (only)
 * `BrokerAdapter` today. Attempts a single live read of the Alpaca PAPER
 * account/positions; when credentials aren't configured (this
 * environment) or the call fails, returns `available: false` with the
 * reason rather than fabricating equity/cash numbers.
 */
export async function getNovaCorePortfolioSnapshot(): Promise<NovaCorePortfolioSnapshot> {
  const broker = createAlpacaPaperBrokerAdapter();
  const [accountResult, positionsResult] = await Promise.all([broker.getAccount(), broker.getPositions()]);

  if (!accountResult.ok) {
    return {
      accounts: [],
      positions: [],
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

  return {
    accounts: [{ broker: broker.id, accountId: account.accountId, environment: broker.environment, cash: account.cash, equity: account.equity, buyingPower: account.buyingPower }],
    positions: positions.map((p) => ({ strategyId: "RS3M_CANDIDATE_V1", symbol: p.symbol, qty: p.qty, marketValue: p.marketValue, unrealizedPl: p.unrealizedPl })),
    totalEquity: account.equity,
    totalCash: account.cash,
    strategiesCount: 1,
    available: true,
    sourceOfTruth: { account: "Alpaca PAPER API (live read)", positions: "Alpaca PAPER API (live read)" },
  };
}
