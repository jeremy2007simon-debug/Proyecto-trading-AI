import type { MarketNewsCategory } from "@/novacore/market-news/types";

/** Spanish display labels — shared between the News page filter chips and NewsCard. No server-only import chain, safe from client components. */
export const NEWS_CATEGORY_LABEL: Record<MarketNewsCategory, string> = {
  FED_RATES: "FED",
  INFLATION: "Inflación",
  EMPLOYMENT: "Empleo",
  GDP: "PIB",
  TREASURY_YIELDS: "Yields",
  GEOPOLITICS: "Geopolítica",
  TRADE_TARIFFS: "Aranceles",
  EARNINGS: "Resultados",
  TECHNOLOGY: "Tecnología",
  FINANCIAL_SECTOR: "Sector financiero",
  ENERGY: "Energía",
  REGULATION: "Regulación",
  VOLATILITY: "Volatilidad",
  SYSTEMIC_RISK: "Riesgo sistémico",
  GENERAL: "General",
};

export const NEWS_MARKET_LABEL: Record<"SP500" | "NASDAQ100" | "DOWJONES" | "RUSSELL2000", string> = {
  SP500: "S&P 500",
  NASDAQ100: "Nasdaq",
  DOWJONES: "Dow",
  RUSSELL2000: "Russell",
};
