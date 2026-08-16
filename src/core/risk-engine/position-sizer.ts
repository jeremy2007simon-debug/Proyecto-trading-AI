import type { PositionSizer, PositionSizingInput, PositionSizingResult } from "@/core/risk-engine/types";

/**
 * The only concrete `PositionSizer`. Position size is always derived
 * from account equity, risk %, and the entry/stop distance — never a
 * fixed, arbitrary size. `stopDistance === 0` (a degenerate/misconfigured
 * signal) returns a zero position rather than dividing by zero or
 * fabricating an infinite size.
 */
export function createPositionSizer(): PositionSizer {
  return {
    calculate(input: PositionSizingInput): PositionSizingResult {
      const stopDistance = Math.abs(input.entry - input.stopLoss);
      const riskAmount = input.accountEquity * (input.riskPct / 100);
      const positionSize = stopDistance > 0 ? riskAmount / stopDistance : 0;
      return { positionSize, riskAmount, stopDistance };
    },
  };
}
