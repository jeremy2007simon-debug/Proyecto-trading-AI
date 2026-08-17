import type { RiskRulesConfig } from "@/core/risk-engine/types";

export interface DayState {
  dateKey: string;
  tradesOpened: number;
  /** Realized P&L for the day so far, as a % of the equity the day started with. Negative = loss. */
  realizedPnlPct: number;
}

export function createDayState(dateKey: string): DayState {
  return { dateKey, tradesOpened: 0, realizedPnlPct: 0 };
}

export interface DailyRiskGateResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Gates whether a NEW entry may be opened today — never affects an
 * already-open position, which is always managed through to its natural
 * exit (stop/target/time) regardless of this gate. Reuses
 * `RiskRulesConfig`/`DEFAULT_RISK_RULES` (`src/core/risk-engine/types.ts`)
 * so the exact limits the user configured — 0.5% risk/trade via
 * position sizing, 1% max daily loss, 2 max trades/day — are enforced
 * with no separate/duplicated constants.
 */
export function evaluateDailyRiskGate(day: DayState, rules: RiskRulesConfig): DailyRiskGateResult {
  if (day.tradesOpened >= rules.maxTradesPerDay) {
    return {
      allowed: false,
      reason: `Max trades per day reached (${day.tradesOpened}/${rules.maxTradesPerDay}).`,
    };
  }
  if (day.realizedPnlPct <= -rules.maxDailyLossPct) {
    return {
      allowed: false,
      reason: `Max daily loss reached (${day.realizedPnlPct.toFixed(2)}% <= -${rules.maxDailyLossPct}%).`,
    };
  }
  return { allowed: true };
}
