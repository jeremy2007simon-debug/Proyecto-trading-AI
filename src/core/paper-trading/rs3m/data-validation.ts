import type { RelativeStrengthAssetInput } from "@/core/backtesting/research/relative-strength";

/**
 * Block 6, forward-testing hardening — defensive input validation for the
 * candles handed to `computeCurrentRs3mSignal`, added ADDITIVELY in front
 * of the frozen ranking pipeline. Deliberately does NOT touch
 * `relative-strength.ts` (shared byte-for-byte with the audited Block 5
 * backtest — see that file's own doc comment): `periodReturn` there
 * already guards `from <= 0`, but a non-finite (`NaN`/`Infinity`) close —
 * e.g. a malformed upstream API payload — is NOT `<= 0` and would
 * silently produce a `NaN` trailing return, which `Array.prototype.sort`
 * handles as undefined behavior (a `NaN`-return asset could sort into
 * first place). Since RS3M is single-winner 100%, an incorrectly ranked
 * "winner" from bad data would become a REAL paper order. This module
 * exists to catch that upstream, before the signal is even computed, and
 * is intentionally independent of and never imported by the backtest
 * path — a pure, additive safety boundary specific to the live/paper
 * production pipeline.
 */

export interface MalformedCandleViolation {
  market: string;
  timestamp: string;
  field: "open" | "high" | "low" | "close" | "volume";
  value: number;
  reason: string;
}

function isValidPrice(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidVolume(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Validates every candle of every asset — never just the latest one —
 * since a corrupted historical bar inside the lookback window would
 * corrupt the trailing-return calculation just as badly as a corrupted
 * latest bar. Returns ALL violations found (never short-circuits),
 * matching `safety-guards.ts`'s "collect everything wrong at once"
 * convention.
 */
export function validateAssetCandles(assets: readonly RelativeStrengthAssetInput[]): MalformedCandleViolation[] {
  const violations: MalformedCandleViolation[] = [];

  for (const asset of assets) {
    for (const candle of asset.candles) {
      const priceFields: readonly ["open" | "high" | "low" | "close", number][] = [
        ["open", candle.open],
        ["high", candle.high],
        ["low", candle.low],
        ["close", candle.close],
      ];
      for (const [field, value] of priceFields) {
        if (!isValidPrice(value)) {
          violations.push({ market: asset.market, timestamp: candle.timestamp, field, value, reason: `${field} price must be a finite number > 0, got ${value}.` });
        }
      }
      if (!isValidVolume(candle.volume)) {
        violations.push({ market: asset.market, timestamp: candle.timestamp, field: "volume", value: candle.volume, reason: `volume must be a finite number >= 0, got ${candle.volume}.` });
      }
    }
  }

  return violations;
}
