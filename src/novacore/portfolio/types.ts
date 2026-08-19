/**
 * Block 7, section 13 — `NovaCorePortfolio`. A READ-ONLY aggregation
 * model across brokers/accounts/strategies. Explicitly out of scope for
 * this block: automatic allocation, moving capital, or a Consensus
 * Engine across strategies (section 13's "NO hacer" list) — this is
 * model + read only. Today there is exactly one broker/account/strategy
 * to aggregate (RS3M / Alpaca paper); the shape supports more without
 * requiring a rewrite once Strategy #2 exists.
 */
export interface NovaCorePortfolioAccount {
  broker: string;
  accountId: string;
  environment: "PAPER" | "LIVE";
  cash: number;
  equity: number;
  buyingPower: number;
}

export interface NovaCorePortfolioPosition {
  strategyId: string;
  symbol: string;
  qty: number;
  marketValue: number;
  unrealizedPl: number;
}

export interface NovaCorePortfolioSnapshot {
  accounts: NovaCorePortfolioAccount[];
  positions: NovaCorePortfolioPosition[];
  totalEquity: number;
  totalCash: number;
  strategiesCount: number;
  available: boolean;
  unavailableReason?: string;
  sourceOfTruth: Record<string, string>;
}
