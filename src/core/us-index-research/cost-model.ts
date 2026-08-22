/**
 * Block 8.3 — equity-ETF cost model. Distinct bps tiers for SWING
 * (daily-or-slower rebalance: Families 1/3/4/5) vs INTRADAY (Family 2)
 * strategies, per the brief's explicit "diferenciar intraday execution
 * costs de daily/swing execution costs" instruction — SPY/QQQ/IWM/DIA
 * are all extremely liquid (penny-wide NBBO spreads in practice), so a
 * SWING round-trip is cheaper than Block 8.2's FX majors; INTRADAY
 * trades more often and is modeled with a wider REALISTIC/STRESSED
 * spread to reflect that a market order pays the spread on every entry
 * AND exit, not once per month. ALL figures below are ESTIMATED — no
 * real bid/ask feed is reachable from this environment (see the report's
 * data-audit section) — never presented as OBSERVED.
 *
 * `REALISTIC_COST_SCENARIO`/`ZERO_COST_BASELINE` from
 * `@/core/backtesting/types` (5bps slippage + $0.005 half-spread) is
 * NOT reused here: that preset is calibrated for a $-denominated,
 * per-fill intraday equity trade, whereas Families 1/3/4/5 need a
 * turnover-based bps-of-notional figure (same reasoning Block 8.2's own
 * `cost-model.ts` documents for why it doesn't reuse
 * `forex-cost-presets.ts`). Family 2 (Intraday Momentum) DOES reuse
 * `ExecutionCostConfig`/`costsForBps` directly, since it runs through
 * the actual per-fill event-driven engine.
 */
export type CostScenario = "OPTIMISTIC" | "REALISTIC" | "STRESSED";

/** Round-trip bps per full unit of weight turnover (0→1 or 1→0), for a DAILY-OR-SLOWER rebalance strategy on these four highly liquid ETFs. */
export const SWING_ROUND_TRIP_BPS: Record<CostScenario, number> = {
  OPTIMISTIC: 0,
  REALISTIC: 3,
  STRESSED: 10,
};

export function swingTurnoverCost(weightChange: number, scenario: CostScenario): number {
  return Math.abs(weightChange) * (SWING_ROUND_TRIP_BPS[scenario] / 10_000);
}

/** Same shape, but at an arbitrary flat bps figure — used only for the break-even-cost diagnostic sweep, never the scenario gate itself (same convention as Block 8.2's `legTurnoverCostFlat`). */
export function swingTurnoverCostFlat(weightChange: number, flatBps: number): number {
  return Math.abs(weightChange) * (flatBps / 10_000);
}

/**
 * Round-trip bps for ONE intraday entry+exit pair, wider than the swing
 * tier because it is paid far more often (per trade, not per month) and
 * because intraday fills are more exposed to transient
 * spread-widening than an end-of-day fill.
 */
export const INTRADAY_ROUND_TRIP_BPS: Record<CostScenario, number> = {
  OPTIMISTIC: 1,
  REALISTIC: 4,
  STRESSED: 12,
};
