import "server-only";

import type {
  MarketRegime,
  MarketRegimeRecord,
  RegimeDetectionResult,
  RegimeRuleEvaluation,
} from "@/core/market-regime/types";
import type { IndicatorSnapshot } from "@/core/indicators/types";
import type { Market, Timeframe } from "@/core/shared/types";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

interface MarketRegimeRow {
  id: string;
  market: Market;
  timeframe: Timeframe;
  detected_at: string;
  regime: MarketRegime;
  previous_regime: MarketRegime | null;
  confidence_score: number;
  rules_evaluated: RegimeRuleEvaluation[];
  indicators_snapshot: IndicatorSnapshot;
  ended_at: string | null;
  duration_seconds: number | null;
}

function toRecord(row: MarketRegimeRow): MarketRegimeRecord {
  return {
    id: row.id,
    market: row.market,
    timeframe: row.timeframe,
    timestamp: row.detected_at,
    regime: row.regime,
    previousRegime: row.previous_regime ?? undefined,
    confidenceScore: Number(row.confidence_score),
    rulesEvaluated: row.rules_evaluated ?? [],
    indicatorsSnapshot: row.indicators_snapshot ?? {},
    endedAt: row.ended_at ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
  };
}

export async function getLatestRegime(
  market: Market,
  timeframe: Timeframe,
): Promise<MarketRegimeRecord | undefined> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("market_regimes")
    .select("*")
    .eq("market", market)
    .eq("timeframe", timeframe)
    .order("detected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to read latest market regime: ${error.message}`);
  return data ? toRecord(data as MarketRegimeRow) : undefined;
}

export async function getRegimeHistory(
  market: Market,
  timeframe: Timeframe,
  limit = 50,
): Promise<MarketRegimeRecord[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("market_regimes")
    .select("*")
    .eq("market", market)
    .eq("timeframe", timeframe)
    .order("detected_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to read market regime history: ${error.message}`);
  return ((data ?? []) as MarketRegimeRow[]).map(toRecord);
}

/**
 * Persists a regime detection result. If it matches the latest stored
 * regime, this is a no-op (returns the existing row) — a row is only
 * ever written on a genuine change, which is what keeps `duration`
 * meaningful. When the regime does change, the previous row is closed
 * out (`ended_at`/`duration_seconds`) before the new one is inserted.
 */
export async function insertRegimeTransition(
  result: RegimeDetectionResult,
): Promise<MarketRegimeRecord> {
  const supabase = createSupabaseServiceRoleClient();
  const latest = await getLatestRegime(result.market, result.timeframe);

  if (latest && latest.regime === result.regime) {
    return latest;
  }

  if (latest && !latest.endedAt) {
    const durationSeconds = Math.max(
      0,
      Math.round(
        (new Date(result.timestamp).getTime() - new Date(latest.timestamp).getTime()) / 1000,
      ),
    );
    const { error: closeError } = await supabase
      .from("market_regimes")
      .update({ ended_at: result.timestamp, duration_seconds: durationSeconds })
      .eq("id", latest.id);
    if (closeError) {
      throw new Error(`Failed to close previous market regime row: ${closeError.message}`);
    }
  }

  const { data, error } = await supabase
    .from("market_regimes")
    .insert({
      market: result.market,
      timeframe: result.timeframe,
      detected_at: result.timestamp,
      regime: result.regime,
      previous_regime: result.previousRegime ?? latest?.regime ?? null,
      confidence_score: result.confidenceScore,
      rules_evaluated: result.rulesEvaluated,
      indicators_snapshot: result.indicatorsSnapshot,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to insert market regime: ${error.message}`);
  return toRecord(data as MarketRegimeRow);
}
