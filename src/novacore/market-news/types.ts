import type { Market } from "@/core/shared/types";
import type { DataProvenance, ISOTimestamp } from "@/novacore/shared/types";

/**
 * Observability Upgrade §5-9 — Market News. OBSERVABILITY ONLY: nothing
 * in this module (or any consumer of it) may generate an order, change
 * RS3M's parameters, approve a rebalance, bypass a guard, or otherwise
 * touch the execution path — see `docs/BLOCK7_NOVACORE_TRADING_LAB.md`
 * "NEWS → OBSERVABILITY, never NEWS → EXECUTION".
 */
export type MarketNewsCategory =
  | "FED_RATES"
  | "INFLATION"
  | "EMPLOYMENT"
  | "GDP"
  | "TREASURY_YIELDS"
  | "GEOPOLITICS"
  | "TRADE_TARIFFS"
  | "EARNINGS"
  | "TECHNOLOGY"
  | "FINANCIAL_SECTOR"
  | "ENERGY"
  | "REGULATION"
  | "VOLATILITY"
  | "SYSTEMIC_RISK"
  | "GENERAL";

/** Informational only — see the module doc comment. Never consumed as a trading signal. */
export type MarketNewsSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

export interface MarketNewsItem {
  id: string;
  headline: string;
  source: string;
  publishedAt: ISOTimestamp;
  url: string;
  /** Short snippet only, when the provider's license permits it — never a full article body. */
  summary?: string;
  category: MarketNewsCategory;
  relatedMarkets: Market[];
  relatedSymbols: string[];
  /** 0-100, deterministically derived — see `relevance.ts`. Never an LLM output. */
  relevanceScore: number;
  sentiment?: MarketNewsSentiment;
  /** Deterministic, template-based explanation — never a trading recommendation. See `relevance.ts#buildWhyItMatters`. */
  whyItMatters?: string;
}

export interface MarketNewsResult {
  available: boolean;
  unavailableReason?: string;
  items: MarketNewsItem[];
  provenance: DataProvenance;
  source: string;
  asOf?: ISOTimestamp;
}

export interface MarketNewsQuery {
  category?: MarketNewsCategory;
  market?: Market;
  limit?: number;
}
