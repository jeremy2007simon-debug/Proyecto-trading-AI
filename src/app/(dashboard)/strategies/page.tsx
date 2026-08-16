import { DataUnavailableNotice } from "@/components/dashboard/DataUnavailableNotice";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StrategyMatrix, type StrategyMatrixRow } from "@/components/strategy/StrategyMatrix";
import type { MarketRegime } from "@/core/market-regime/types";
import type { StrategyRegistrationSummary } from "@/lib/data/strategy-signals.server";
import { getStrategySignals } from "@/lib/data/strategy-signals.server";
import type { StrategySignal } from "@/core/strategy-manager/types";

const MARKET = "SP500" as const;
const TIMEFRAME = "15m" as const;

function toStrategyMatrixRow(
  signal: StrategySignal,
  registration: StrategyRegistrationSummary | undefined,
  currentRegime: MarketRegime,
): StrategyMatrixRow {
  return {
    strategyId: signal.strategyId,
    strategyName: signal.strategyName,
    market: signal.market,
    timeframe: signal.timeframe,
    signal: signal.signal,
    weight: registration?.weight ?? 0,
    rawScore: signal.rawScore,
    currentRegime,
    compatibleWithCurrentRegime: registration?.compatibleRegimes.includes(currentRegime) ?? false,
    enabled: registration?.enabled ?? false,
    // No real backtests exist yet — see docs/ARCHITECTURE.md and the
    // strategy detail page, which deliberately omits these too.
    winRate: undefined,
    profitFactor: undefined,
    sampleSize: undefined,
  };
}

export default async function StrategiesPage() {
  const overview = await getStrategySignals(MARKET, TIMEFRAME);

  return (
    <div>
      <PageHeader
        title="Strategies"
        description="Registered strategies, their current signal, weight, and regime compatibility."
      />

      {overview.ok ? (
        <StrategyMatrix
          rows={overview.value.signals.map((signal) =>
            toStrategyMatrixRow(
              signal,
              overview.value.registrations.find((r) => r.id === signal.strategyId),
              overview.value.regime.regime,
            ),
          )}
        />
      ) : (
        <DataUnavailableNotice reason={overview.error.reason} />
      )}
    </div>
  );
}
