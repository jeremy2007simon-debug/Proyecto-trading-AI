import { legTurnoverCost, legTurnoverCostFlat, swapMarkupMonthly, type CostScenario } from "@/core/portfolio-research/cost-model";
import { INSTRUMENTS } from "@/core/portfolio-research/instruments";
import type { AlignedReturns } from "@/core/portfolio-research/alignment";
import type { RawSignalMap } from "@/core/portfolio-research/family-signals";
import type { FxInstrument, LegPosition, PortfolioBacktestResult, PortfolioPeriodResult } from "@/core/portfolio-research/types";

/**
 * The core Block 8.2 simulator: a monthly rebalance-date loop over a
 * basket of instruments, each vol-normalized to an equal target risk
 * contribution (Moskowitz, Ooi & Pedersen 2012's own methodology — see
 * §8 of the report), aggregated into ONE portfolio return per month.
 *
 * All figures are RISK-NORMALIZED excess-return units, not a leveraged
 * $ P&L against an assumed capital base — see `TARGET_ANNUAL_VOL_PER_LEG`'s
 * docstring for why no capital/leverage assumption is fabricated here.
 * `carryReturn` (already present on each `AlignedReturns` entry via
 * `family-signals.ts`'s carry lookups being folded into the family's
 * own return construction) is added on top of spot return ONLY for
 * families that model it (Family 3, and Family 5's carry component) —
 * see the `includeCarry` flag.
 */

const TARGET_ANNUAL_VOL_PER_LEG = 0.1; // 10%/yr — a standard vol-targeting convention (matches the cited literature's own methodology), NOT a claim about real deployable capital or leverage.
const TARGET_MONTHLY_VOL_PER_LEG = TARGET_ANNUAL_VOL_PER_LEG / Math.sqrt(12);
const MIN_TRAILING_VOL = 0.02; // floor to avoid a near-zero trailing vol producing an absurd position size

export interface PortfolioEngineConfig {
  experimentId: string;
  costScenario: CostScenario;
  /** Add the interest-rate-differential ("carry") return component on top of spot — only true for Family 3 and Family 5's carry-weighted legs. */
  includeCarry: boolean;
  /** When carry is included, the causal per-instrument, per-month carry differential (already monthly-scaled) — from `carry.ts`. */
  carryByInstrumentMonthKey?: Partial<Record<FxInstrument, Map<string, number>>>;
  /** When set, overrides `costScenario`'s per-instrument table with one flat bps figure for every leg — used only by the break-even-cost sweep. Swap markup still comes from `costScenario` unless this is also meant to zero it out at bps=0 (the sweep's own caller sets `costScenario: "OPTIMISTIC"`, whose swap markup is 0, alongside this override). */
  flatCostBpsOverride?: number;
}

export function runPortfolioBacktest(aligned: AlignedReturns, signals: readonly RawSignalMap[], config: PortfolioEngineConfig): PortfolioBacktestResult {
  const periods: PortfolioPeriodResult[] = [];
  const positions: LegPosition[] = [];
  let previousWeights: Partial<Record<FxInstrument, number>> = {};
  const anyInstrument = Object.keys(aligned.byInstrument)[0] as FxInstrument | undefined;

  for (let i = 0; i < aligned.monthKeys.length; i++) {
    const monthKey = aligned.monthKeys[i];
    const rawSignal = signals[i] ?? {};
    const currentWeights: Partial<Record<FxInstrument, number>> = {};

    for (const [instrument, raw] of Object.entries(rawSignal) as [FxInstrument, number][]) {
      if (raw === 0) continue;
      const entry = aligned.byInstrument[instrument]?.[i];
      const trailingVol = Math.max(entry?.trailingAnnualizedVol ?? MIN_TRAILING_VOL, MIN_TRAILING_VOL);
      const monthlyVol = trailingVol / Math.sqrt(12);
      const weight = raw * (TARGET_MONTHLY_VOL_PER_LEG / monthlyVol);
      currentWeights[instrument] = weight;
      positions.push({ monthEnd: entry?.signalMonthEnd ?? monthKey, instrument, weight, rawSignal: raw });
    }

    let grossReturn = 0;
    let costDrag = 0;
    let turnover = 0;
    let activeLegs = 0;
    let netUsdExposure = 0;

    const allInstruments = new Set([...Object.keys(currentWeights), ...Object.keys(previousWeights)]) as Set<FxInstrument>;
    for (const instrument of allInstruments) {
      const weight = currentWeights[instrument] ?? 0;
      const previousWeight = previousWeights[instrument] ?? 0;
      const weightChange = weight - previousWeight;
      turnover += Math.abs(weightChange);
      costDrag +=
        config.flatCostBpsOverride !== undefined
          ? legTurnoverCostFlat(weightChange, config.flatCostBpsOverride)
          : legTurnoverCost(instrument, weightChange, config.costScenario);

      if (weight !== 0) {
        activeLegs += 1;
        const entry = aligned.byInstrument[instrument]?.[i];
        // GROSS includes the OBSERVED rate-differential (carry) — a real
        // economic return component, not a cost. The broker's ESTIMATED
        // markup on top of that differential IS a cost and belongs in
        // costDrag, never folded into grossReturn (§6/§13 of the report:
        // never mix OBSERVED and ESTIMATED, and GROSS must mean GROSS).
        let legReturn = weight * (entry?.value ?? 0);
        if (config.includeCarry) {
          const carry = config.carryByInstrumentMonthKey?.[instrument]?.get(monthKey) ?? 0;
          legReturn += weight * carry;
          costDrag += Math.abs(weight) * swapMarkupMonthly(config.costScenario);
        }
        grossReturn += legReturn;

        const def = INSTRUMENTS[instrument];
        if (def.shortCurrency === "USD") netUsdExposure += weight;
        else if (def.longCurrency === "USD") netUsdExposure -= weight;
      }
    }

    periods.push({
      monthEnd: (anyInstrument && aligned.byInstrument[anyInstrument]?.[i]?.monthEnd) ?? monthKey,
      signalMonthEnd: (anyInstrument && aligned.byInstrument[anyInstrument]?.[i]?.signalMonthEnd) ?? monthKey,
      grossReturn,
      costDrag,
      netReturn: grossReturn - costDrag,
      turnover,
      activeLegs,
      netUsdExposure,
    });

    previousWeights = currentWeights;
  }

  return { experimentId: config.experimentId, periods, positions };
}
