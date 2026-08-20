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
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPl: number;
  unrealizedPlPct: number | undefined;
}

export interface NovaCorePortfolioOrder {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  status: string;
  submittedAt: string;
  filledAt?: string;
  filledQty?: number;
  filledAvgPrice?: number;
}

export interface NovaCorePortfolioSnapshot {
  accounts: NovaCorePortfolioAccount[];
  positions: NovaCorePortfolioPosition[];
  /** Most recent orders first, capped by the adapter — never a mutation path, read-only via BrokerAdapter#getOrders. */
  recentOrders: NovaCorePortfolioOrder[];
  totalEquity: number;
  totalCash: number;
  strategiesCount: number;
  available: boolean;
  unavailableReason?: string;
  /** When this snapshot's live reads actually completed — undefined when `available` is false. */
  lastSyncedAt?: string;
  sourceOfTruth: Record<string, string>;
}
