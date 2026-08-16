import type { SampleQualityLabel } from "@/core/backtesting/types";

/**
 * Purely a function of trade count. Documented thresholds — a
 * reasonable, commonly-used rule of thumb for retail/research-scale
 * strategy evaluation, NOT claimed to be statistically optimal or
 * derived from a significance test. Every metrics summary this system
 * presents must carry this label alongside it (point 18): a Sharpe
 * ratio or expectancy computed on 15 trades is not evidence on its own.
 */
export function classifySampleQuality(tradeCount: number): SampleQualityLabel {
  if (tradeCount < 10) return "INSUFFICIENT";
  if (tradeCount < 30) return "LOW";
  if (tradeCount < 100) return "MEDIUM";
  return "HIGH";
}
