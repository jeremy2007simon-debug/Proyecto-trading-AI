import type { Market } from "@/core/shared/types";
import type { MarketNewsCategory } from "@/novacore/market-news/types";

/**
 * Observability Upgrade §7, §9 — deterministic classification. No LLM,
 * no external call, no randomness: the same headline always produces the
 * same category/relevance/explanation. This is what keeps "Why it
 * matters" from ever turning into a trading recommendation — it is a
 * lookup table, not a model, and has no path into the execution flow.
 */

const CATEGORY_KEYWORDS: Record<Exclude<MarketNewsCategory, "GENERAL">, string[]> = {
  FED_RATES: ["fed", "federal reserve", "interest rate", "rate hike", "rate cut", "fomc", "powell", "monetary policy"],
  INFLATION: ["inflation", "cpi", "pce", "consumer price", "core prices"],
  EMPLOYMENT: ["jobs report", "unemployment", "payroll", "nonfarm", "labor market", "jobless claims"],
  GDP: ["gdp", "gross domestic product", "economic growth", "economic output"],
  TREASURY_YIELDS: ["treasury yield", "10-year", "bond yield", "yield curve", "treasuries"],
  GEOPOLITICS: ["war", "geopolitic", "conflict", "sanctions", "invasion", "military"],
  TRADE_TARIFFS: ["tariff", "trade war", "trade deal", "import duty", "trade tension"],
  EARNINGS: ["earnings", "quarterly results", "guidance", "eps", "revenue beat", "profit warning"],
  TECHNOLOGY: ["ai", "artificial intelligence", "chip", "semiconductor", "software", "tech", "cloud computing"],
  FINANCIAL_SECTOR: ["bank", "jpmorgan", "goldman", "financial sector", "credit conditions", "lender"],
  ENERGY: ["oil price", "energy price", "opec", "crude", "gas price", "natural gas"],
  REGULATION: ["sec", "regulation", "antitrust", "lawsuit", "regulator", "fine", "probe"],
  VOLATILITY: ["volatility", "vix", "selloff", "sell-off", "rally", "market swing", "whipsaw"],
  SYSTEMIC_RISK: ["systemic risk", "contagion", "credit crunch", "bank run", "financial crisis", "liquidity crisis"],
};

/** Order matters: more specific/severe categories are checked first so a headline matching multiple keyword sets gets the more decision-relevant label. */
const CATEGORY_PRIORITY: Exclude<MarketNewsCategory, "GENERAL">[] = [
  "SYSTEMIC_RISK",
  "FED_RATES",
  "INFLATION",
  "TREASURY_YIELDS",
  "EMPLOYMENT",
  "GDP",
  "GEOPOLITICS",
  "TRADE_TARIFFS",
  "FINANCIAL_SECTOR",
  "ENERGY",
  "REGULATION",
  "EARNINGS",
  "TECHNOLOGY",
  "VOLATILITY",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary matching — a plain substring test would match "war" inside "award" or "sec" inside "second". */
function containsKeyword(text: string, keyword: string): boolean {
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(text);
}

export function classifyCategory(text: string): MarketNewsCategory {
  const lower = text.toLowerCase();
  for (const category of CATEGORY_PRIORITY) {
    if (CATEGORY_KEYWORDS[category].some((keyword) => containsKeyword(lower, keyword))) return category;
  }
  return "GENERAL";
}

const SYMBOL_TO_MARKET: Record<string, Market> = { SPY: "SP500", QQQ: "NASDAQ100", DIA: "DOWJONES", IWM: "RUSSELL2000" };

export function deriveRelatedMarkets(symbols: string[]): Market[] {
  const markets = new Set<Market>();
  for (const symbol of symbols) {
    const market = SYMBOL_TO_MARKET[symbol.toUpperCase()];
    if (market) markets.add(market);
  }
  return [...markets];
}

const CATEGORY_BASE_SCORE: Record<MarketNewsCategory, number> = {
  FED_RATES: 90,
  SYSTEMIC_RISK: 90,
  INFLATION: 85,
  TREASURY_YIELDS: 80,
  EMPLOYMENT: 75,
  GEOPOLITICS: 75,
  TRADE_TARIFFS: 70,
  GDP: 70,
  VOLATILITY: 65,
  EARNINGS: 60,
  FINANCIAL_SECTOR: 55,
  TECHNOLOGY: 50,
  ENERGY: 50,
  REGULATION: 50,
  GENERAL: 30,
};

/** 0-100. Base score by category, boosted slightly when the article is tagged against more of RS3M's own universe markets. */
export function scoreRelevance(category: MarketNewsCategory, relatedMarkets: Market[]): number {
  const boost = Math.min(relatedMarkets.length * 5, 15);
  return Math.min(CATEGORY_BASE_SCORE[category] + boost, 100);
}

const WHY_IT_MATTERS_TEMPLATE: Partial<Record<MarketNewsCategory, string>> = {
  FED_RATES: "Fed rate decisions move borrowing costs across the whole market and are typically the single largest driver of short-term equity volatility.",
  INFLATION: "Inflation prints shape Fed rate expectations, which in turn move valuations across the index.",
  EMPLOYMENT: "Labor-market data feeds directly into Fed rate decisions and the consumer-spending outlook.",
  GDP: "Growth data sets the macro backdrop equity valuations are priced against.",
  TREASURY_YIELDS: "Rising yields raise the discount rate applied to future earnings, pressuring valuations — especially growth names.",
  GEOPOLITICS: "Geopolitical shocks can move risk sentiment across all four RS3M universe markets at once.",
  TRADE_TARIFFS: "Tariffs directly affect corporate input costs and trade-exposed sectors within the index.",
  EARNINGS: "Earnings surprises from index heavyweights can move an index more than any single macro print.",
  TECHNOLOGY: "Concentration in a handful of technology names makes sector-specific news disproportionately influential for the Nasdaq 100.",
  FINANCIAL_SECTOR: "Bank-sector stress has historically been an early indicator of broader systemic risk.",
  ENERGY: "Energy price swings affect both inflation expectations and corporate costs across the index.",
  REGULATION: "Regulatory action against index constituents can move sector- or index-level pricing.",
  VOLATILITY: "Elevated volatility changes the risk backdrop RS3M's momentum ranking runs in — the ranking rule itself never changes.",
  SYSTEMIC_RISK: "Systemic-risk headlines are the category most likely to trigger a broad, correlated selloff across the RS3M universe.",
};

const MARKET_LABEL: Record<Market, string> = {
  SP500: "the S&P 500",
  NASDAQ100: "the Nasdaq 100",
  DOWJONES: "the Dow Jones",
  RUSSELL2000: "the Russell 2000",
  FOREX_EURUSD: "EUR/USD",
  GOLD: "gold",
  BITCOIN: "Bitcoin",
};

/**
 * Deterministic, template-based explanation only — see the module doc
 * comment. Returns `undefined` for GENERAL (no confident category
 * assigned), which the UI renders as no "Why it matters" line rather
 * than a generic filler sentence.
 */
export function buildWhyItMatters(category: MarketNewsCategory, relatedMarkets: Market[]): string | undefined {
  const template = WHY_IT_MATTERS_TEMPLATE[category];
  if (!template) return undefined;
  const marketNames = relatedMarkets.length > 0 ? relatedMarkets.map((m) => MARKET_LABEL[m]).join(", ") : "the broader market";
  return `${template} Potentially relevant to ${marketNames}.`;
}
