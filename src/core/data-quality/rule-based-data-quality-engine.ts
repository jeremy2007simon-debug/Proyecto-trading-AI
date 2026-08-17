import type {
  DataQualityContext,
  DataQualityEngine,
  DataQualityReport,
  DataQualityRuleEvaluation,
  DataQualityRuleId,
  DataQualityStatus,
} from "@/core/data-quality/types";
import type { Candle } from "@/core/market-data/types";
import { TIMEFRAME_MINUTES } from "@/core/shared/timeframe";

const DEFAULT_MINIMUM_SAMPLE_SIZE = 20;
/** A candle is considered stale once it's this many nominal intervals old while the market is open. */
const STALE_INTERVAL_MULTIPLIER = 3;

const FAIL_RULES: readonly DataQualityRuleId[] = [
  "NO_DUPLICATE_TIMESTAMPS",
  "MONOTONIC_TIMESTAMPS",
  "OHLC_INTERNALLY_CONSISTENT",
  "NO_ZERO_OR_NEGATIVE_PRICES",
  "VOLUME_NON_NEGATIVE",
  "SUFFICIENT_SAMPLE_SIZE",
];

function isOhlcConsistent(candle: Candle): boolean {
  return (
    candle.high >= candle.low &&
    candle.high >= candle.open &&
    candle.high >= candle.close &&
    candle.low <= candle.open &&
    candle.low <= candle.close
  );
}

/**
 * Deterministic, rule-based Data Quality Engine. Every rule is
 * independently evaluated and recorded (pass or fail) for full
 * auditability — the report never hides which specific checks ran.
 */
export function createRuleBasedDataQualityEngine(): DataQualityEngine {
  return {
    id: "rule-based",

    evaluate(candles: readonly Candle[], context: DataQualityContext): DataQualityReport {
      const minimumSampleSize = context.minimumSampleSize ?? DEFAULT_MINIMUM_SAMPLE_SIZE;
      const rulesEvaluated: DataQualityRuleEvaluation[] = [];

      const seenTimestamps = new Set<string>();
      let duplicates = 0;
      for (const candle of candles) {
        if (seenTimestamps.has(candle.timestamp)) duplicates++;
        else seenTimestamps.add(candle.timestamp);
      }
      rulesEvaluated.push({
        rule: "NO_DUPLICATE_TIMESTAMPS",
        passed: duplicates === 0,
        detail:
          duplicates === 0
            ? "No duplicate timestamps found."
            : `${duplicates} duplicate timestamp(s) found.`,
        affectedCount: duplicates,
      });

      let outOfOrder = 0;
      for (let i = 1; i < candles.length; i++) {
        if (
          new Date(candles[i].timestamp).getTime() <=
          new Date(candles[i - 1].timestamp).getTime()
        ) {
          outOfOrder++;
        }
      }
      rulesEvaluated.push({
        rule: "MONOTONIC_TIMESTAMPS",
        passed: outOfOrder === 0,
        detail:
          outOfOrder === 0
            ? "Timestamps are strictly increasing."
            : `${outOfOrder} out-of-order timestamp(s) found.`,
        affectedCount: outOfOrder,
      });

      const invalidOhlcCount = candles.filter((c) => !isOhlcConsistent(c)).length;
      rulesEvaluated.push({
        rule: "OHLC_INTERNALLY_CONSISTENT",
        passed: invalidOhlcCount === 0,
        detail:
          invalidOhlcCount === 0
            ? "All candles have internally consistent OHLC values."
            : `${invalidOhlcCount} candle(s) with inconsistent OHLC (high/low don't bound open/close).`,
        affectedCount: invalidOhlcCount,
      });

      const invalidPriceCount = candles.filter(
        (c) => c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0,
      ).length;
      rulesEvaluated.push({
        rule: "NO_ZERO_OR_NEGATIVE_PRICES",
        passed: invalidPriceCount === 0,
        detail:
          invalidPriceCount === 0
            ? "All prices are positive."
            : `${invalidPriceCount} candle(s) with a zero or negative price.`,
        affectedCount: invalidPriceCount,
      });

      const invalidVolumeCount = candles.filter((c) => c.volume < 0).length;
      rulesEvaluated.push({
        rule: "VOLUME_NON_NEGATIVE",
        passed: invalidVolumeCount === 0,
        detail:
          invalidVolumeCount === 0
            ? "All volumes are non-negative."
            : `${invalidVolumeCount} candle(s) with negative volume.`,
        affectedCount: invalidVolumeCount,
      });

      rulesEvaluated.push({
        rule: "SUFFICIENT_SAMPLE_SIZE",
        passed: candles.length >= minimumSampleSize,
        detail: `${candles.length} candle(s) available; minimum required is ${minimumSampleSize}.`,
      });

      const sorted = [...candles].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const stepMinutes = TIMEFRAME_MINUTES[context.timeframe];

      let gaps = 0;
      let intervalViolations = 0;
      for (let i = 1; i < sorted.length; i++) {
        const prevTs = new Date(sorted[i - 1].timestamp);
        const nextTs = new Date(sorted[i].timestamp);
        const diffMinutes = (nextTs.getTime() - prevTs.getTime()) / 60_000;

        if (diffMinutes < stepMinutes * 0.5) {
          intervalViolations++;
          continue;
        }
        if (diffMinutes > stepMinutes * 1.5) {
          // Heuristic: a gap only counts as "unexpected" if the market
          // should have still been open shortly after the previous
          // candle — overnight/weekend/holiday gaps are normal and are
          // NOT flagged here.
          const sampleInstant = new Date(prevTs.getTime() + stepMinutes * 60_000);
          if (context.calendar.getStatus(sampleInstant).isOpen) gaps++;
        }
      }
      rulesEvaluated.push({
        rule: "NO_GAPS_IN_SEQUENCE",
        passed: gaps === 0,
        detail:
          gaps === 0
            ? "No unexpected gaps during open market hours."
            : `${gaps} unexpected gap(s) detected during open market hours.`,
        affectedCount: gaps,
      });
      rulesEvaluated.push({
        rule: "WITHIN_EXPECTED_TIMEFRAME_INTERVAL",
        passed: intervalViolations === 0,
        detail:
          intervalViolations === 0
            ? `All candle intervals match the "${context.timeframe}" timeframe.`
            : `${intervalViolations} candle(s) closer together than the "${context.timeframe}" timeframe allows.`,
        affectedCount: intervalViolations,
      });

      const currentStatus = context.calendar.getStatus(context.now);
      let stale = false;
      if (currentStatus.isOpen && sorted.length > 0) {
        const lastTimestampMs = new Date(sorted[sorted.length - 1].timestamp).getTime();
        const staleThresholdMs = stepMinutes * STALE_INTERVAL_MULTIPLIER * 60_000;
        stale = context.now.getTime() - lastTimestampMs > staleThresholdMs;
      }
      rulesEvaluated.push({
        rule: "NOT_STALE",
        passed: !stale,
        detail: stale
          ? "The most recent candle is older than expected while the market is open."
          : "Data freshness is within tolerance.",
      });

      const hasFail = rulesEvaluated.some(
        (r) => FAIL_RULES.includes(r.rule) && !r.passed,
      );
      const hasWarn = rulesEvaluated.some(
        (r) => !FAIL_RULES.includes(r.rule) && !r.passed,
      );
      const status: DataQualityStatus = hasFail ? "FAIL" : hasWarn ? "WARN" : "PASS";

      return {
        market: context.market,
        timeframe: context.timeframe,
        evaluatedAt: context.now.toISOString(),
        candleCount: candles.length,
        rangeFrom: sorted[0]?.timestamp,
        rangeTo: sorted[sorted.length - 1]?.timestamp,
        status,
        rulesEvaluated,
        gapsDetected: gaps,
        duplicatesDetected: duplicates,
      };
    },
  };
}
