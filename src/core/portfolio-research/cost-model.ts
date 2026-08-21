import type { FxInstrument } from "@/core/portfolio-research/types";

/**
 * Block 8.2 — portfolio-level cost model. ALL figures below are
 * ESTIMATED (§3.2, §6 of the report): no real bid/ask FX data is
 * reachable from this environment (re-tested for this round —
 * Dukascopy confirmed still unavailable). Never presented as OBSERVED.
 * The one OBSERVED component in this research is the interest-rate
 * differential itself (`carry.ts`, real FRED data) — kept structurally
 * separate from this file's ESTIMATED spread/slippage figures, per the
 * brief's explicit "no mezclar OBSERVED con ESTIMATED" instruction.
 *
 * Expressed as a round-trip cost in bps of notional per FULL turnover
 * unit (i.e., a leg's weight moving from 0 to 1, or 1 to 0) — the
 * natural unit for a monthly-rebalance portfolio, extending Block 8's
 * per-pair pip assumptions (`forex-cost-presets.ts`) to a coarser,
 * turnover-based figure appropriate here instead of reusing that file's
 * per-fill halfSpread/slippagePct shape (built for intraday, per-trade
 * fills).
 */
export type CostScenario = "OPTIMISTIC" | "REALISTIC" | "STRESSED";

/** Round-trip bps per full unit of weight turnover, by pair liquidity tier — majors are more liquid than crosses. */
const ROUND_TRIP_BPS: Record<FxInstrument, { optimistic: number; realistic: number; stressed: number }> = {
  EURUSD: { optimistic: 0.5, realistic: 2, stressed: 6 },
  GBPUSD: { optimistic: 1, realistic: 3, stressed: 8 },
  USDJPY: { optimistic: 0.5, realistic: 2, stressed: 6 },
  AUDUSD: { optimistic: 1, realistic: 3, stressed: 8 },
  USDCAD: { optimistic: 1, realistic: 3, stressed: 8 },
  USDCHF: { optimistic: 1, realistic: 3, stressed: 8 },
  NZDUSD: { optimistic: 1.5, realistic: 4, stressed: 10 },
  EURGBP: { optimistic: 1.5, realistic: 4, stressed: 10 },
  EURJPY: { optimistic: 1.5, realistic: 4, stressed: 10 },
  GBPJPY: { optimistic: 2, realistic: 5, stressed: 12 },
  AUDJPY: { optimistic: 2, realistic: 5, stressed: 12 },
};

export function roundTripCostBps(instrument: FxInstrument, scenario: CostScenario): number {
  const row = ROUND_TRIP_BPS[instrument];
  return scenario === "OPTIMISTIC" ? row.optimistic : scenario === "REALISTIC" ? row.realistic : row.stressed;
}

/** Cost (as a return drag, e.g. 0.0002 = 2bps) for one leg's weight change at one rebalance. */
export function legTurnoverCost(instrument: FxInstrument, weightChange: number, scenario: CostScenario): number {
  return Math.abs(weightChange) * (roundTripCostBps(instrument, scenario) / 10_000);
}

/** Same shape as `legTurnoverCost`, but at a single FLAT bps figure applied uniformly across every instrument — used only for the break-even-cost diagnostic sweep (Stage 4's cost-sensitivity axis), never for the OPTIMISTIC/REALISTIC/STRESSED scenario gate itself. */
export function legTurnoverCostFlat(weightChange: number, flatBps: number): number {
  return Math.abs(weightChange) * (flatBps / 10_000);
}

/**
 * Swap/financing broker markup — ESTIMATED, added on top of the
 * OBSERVED rate differential already captured in `carry.ts`'s spot+carry
 * return. A conservative constant drag applied to every leg's carry
 * component, modeling the spread a real broker adds over the
 * theoretical interbank differential.
 */
export const SWAP_MARKUP_ANNUAL_BPS: Record<CostScenario, number> = {
  OPTIMISTIC: 0,
  REALISTIC: 20, // 0.20%/yr
  STRESSED: 60, // 0.60%/yr
};

export function swapMarkupMonthly(scenario: CostScenario): number {
  return SWAP_MARKUP_ANNUAL_BPS[scenario] / 10_000 / 12;
}
