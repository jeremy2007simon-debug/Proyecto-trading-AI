import type { ExecutionCostConfig, BacktestTrade } from "@/core/backtesting/types";
import type { Market } from "@/core/shared/types";

/**
 * Block 8 (Forex Research Lab) — FX-specific execution cost model.
 *
 * Deliberately NOT derived from `REALISTIC_COST_SCENARIO`
 * (`backtesting/types.ts`), which is explicitly documented as an
 * SPY/equity-tuned preset. FX needs its own model for two reasons: (1)
 * spreads are quoted in pips, a unit tied to each pair's own price scale
 * (0.0001 for most majors, 0.01 for JPY pairs), and (2) our data source
 * (Yahoo's unofficial chart API — see
 * `scripts/research/forex/fetch-fx-candles.ts`) provides only an
 * indicative last/mid-style price series, NOT a measured bid/ask spread.
 * Every spread figure below is therefore an ASSUMPTION sourced from
 * commonly published typical retail/ECN spread ranges for major pairs —
 * NOT something measured from this project's own data feed. Treat these
 * as scenario inputs to be stress-tested against, not ground truth.
 *
 * `commissionPerFill` is fixed at 0 for every FX scenario, on purpose:
 * the backtesting engine's `commissionPerFill` is a flat $ amount per
 * fill, which does not scale with position size — wrong for FX round-turn
 * commission, which scales with notional (e.g. "$X per 100k traded").
 * Modeling FX transaction cost entirely through `halfSpread` (which DOES
 * scale correctly — see `applyEntryCost`/`applyMarketExitCost` in
 * `event-driven-simulator.ts`, both multiply by quantity) avoids
 * introducing a cost component with the wrong shape. This is a
 * documented simplification, not a claim that real FX brokers charge no
 * commission.
 */

export interface FxPairCostAssumptions {
  market: Market;
  /** Price units per pip (0.0001 for most majors, 0.01 for JPY pairs). */
  pipSize: number;
  /** Full (not half) bid/ask spread, in pips, per scenario. */
  spreadPips: { optimistic: number; realistic: number; stressed: number };
  /** Additional execution slippage beyond the quoted spread, as a fraction of price (e.g. 0.0001 = 1bp), per scenario. */
  slippagePct: { optimistic: number; realistic: number; stressed: number };
  /**
   * Approximate overnight swap/rollover cost, in pips-equivalent per
   * night held, charged against BOTH directions (a conservative
   * simplification — real swap is often asymmetric long vs short, and
   * varies with each broker's markup and the prevailing rate
   * differential, none of which this research has live access to).
   * `0` in the OPTIMISTIC scenario (treats swap as negligible / assumes
   * no positions held overnight), a small conservative constant in
   * REALISTIC and STRESSED.
   */
  swapPipsPerNight: { optimistic: number; realistic: number; stressed: number };
}

/**
 * Source: commonly published typical retail/ECN spread ranges for major
 * pairs (general market knowledge, not a live quote or broker-specific
 * schedule). Recorded here, once, so every experiment cites the same
 * assumption instead of each script guessing its own numbers. See
 * `docs/BLOCK8_FOREX_RESEARCH_REPORT.md` §Cost Model for the full
 * disclosure and the resulting break-even-cost sensitivity analysis.
 */
export const FX_COST_ASSUMPTIONS: Record<
  "FOREX_EURUSD" | "FOREX_GBPUSD" | "FOREX_USDJPY" | "FOREX_AUDUSD",
  FxPairCostAssumptions
> = {
  FOREX_EURUSD: {
    market: "FOREX_EURUSD",
    pipSize: 0.0001,
    spreadPips: { optimistic: 0.2, realistic: 0.8, stressed: 2.5 },
    slippagePct: { optimistic: 0, realistic: 0.0001, stressed: 0.0005 },
    swapPipsPerNight: { optimistic: 0, realistic: 0.3, stressed: 0.8 },
  },
  FOREX_GBPUSD: {
    market: "FOREX_GBPUSD",
    pipSize: 0.0001,
    spreadPips: { optimistic: 0.5, realistic: 1.2, stressed: 3.5 },
    slippagePct: { optimistic: 0, realistic: 0.00015, stressed: 0.0007 },
    swapPipsPerNight: { optimistic: 0, realistic: 0.4, stressed: 1.0 },
  },
  FOREX_USDJPY: {
    market: "FOREX_USDJPY",
    pipSize: 0.01,
    spreadPips: { optimistic: 0.2, realistic: 0.9, stressed: 2.5 },
    slippagePct: { optimistic: 0, realistic: 0.0001, stressed: 0.0005 },
    swapPipsPerNight: { optimistic: 0, realistic: 0.3, stressed: 0.8 },
  },
  FOREX_AUDUSD: {
    market: "FOREX_AUDUSD",
    pipSize: 0.0001,
    spreadPips: { optimistic: 0.5, realistic: 1.3, stressed: 3.5 },
    slippagePct: { optimistic: 0, realistic: 0.00015, stressed: 0.0007 },
    swapPipsPerNight: { optimistic: 0, realistic: 0.4, stressed: 1.0 },
  },
};

export type FxCostScenario = "OPTIMISTIC" | "REALISTIC" | "STRESSED";

const SCENARIO_KEY: Record<FxCostScenario, "optimistic" | "realistic" | "stressed"> = {
  OPTIMISTIC: "optimistic",
  REALISTIC: "realistic",
  STRESSED: "stressed",
};

export function getFxExecutionCostConfig(
  market: keyof typeof FX_COST_ASSUMPTIONS,
  scenario: FxCostScenario,
): ExecutionCostConfig {
  const a = FX_COST_ASSUMPTIONS[market];
  const key = SCENARIO_KEY[scenario];
  const fullSpreadPrice = a.spreadPips[key] * a.pipSize;
  return {
    commissionPerFill: 0,
    slippagePct: a.slippagePct[key],
    halfSpread: fullSpreadPrice / 2,
  };
}

export interface SwapAdjustmentResult {
  /** Total swap cost across all trades, in account currency (always <= 0). */
  totalSwapCost: number;
  /** Per-trade swap cost, same order/length as the input trades. */
  perTradeSwapCost: number[];
  /** Trades whose entry/exit crossed at least one UTC calendar-day boundary (i.e. held overnight). */
  overnightTradeCount: number;
}

/**
 * Post-hoc swap/rollover cost estimate — NOT applied inside the engine
 * (`ExecutionCostConfig` has no swap field; entry/exit-fill costs and
 * overnight holding costs are conceptually different things). Nights
 * held is counted as the number of UTC calendar-day boundaries crossed
 * between `entryAt` and `exitAt`, a coarse but defensible proxy given
 * this research doesn't have a real broker's rollover-time convention.
 * Charged as a pure subtraction from `pnlAmount`, scaled by
 * `positionSize` the same way `halfSpread` is inside the engine.
 */
export function applySwapAdjustment(
  trades: readonly BacktestTrade[],
  market: keyof typeof FX_COST_ASSUMPTIONS,
  scenario: FxCostScenario,
): SwapAdjustmentResult {
  const a = FX_COST_ASSUMPTIONS[market];
  const swapPipsPerNight = a.swapPipsPerNight[SCENARIO_KEY[scenario]];
  const swapPricePerNight = swapPipsPerNight * a.pipSize;

  const perTradeSwapCost: number[] = [];
  let totalSwapCost = 0;
  let overnightTradeCount = 0;

  for (const trade of trades) {
    if (!trade.exitAt || swapPricePerNight === 0) {
      perTradeSwapCost.push(0);
      continue;
    }
    const entryDay = trade.entryAt.slice(0, 10);
    const exitDay = trade.exitAt.slice(0, 10);
    const nightsHeld = Math.max(
      0,
      Math.round((new Date(exitDay).getTime() - new Date(entryDay).getTime()) / 86_400_000),
    );
    if (nightsHeld === 0) {
      perTradeSwapCost.push(0);
      continue;
    }
    overnightTradeCount += 1;
    const cost = -swapPricePerNight * nightsHeld * trade.positionSize;
    perTradeSwapCost.push(cost);
    totalSwapCost += cost;
  }

  return { totalSwapCost, perTradeSwapCost, overnightTradeCount };
}
