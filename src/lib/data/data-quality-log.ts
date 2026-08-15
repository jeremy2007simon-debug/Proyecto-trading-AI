import "server-only";

import type { DataQualityReport } from "@/core/data-quality/types";
import type { Market, Timeframe } from "@/core/shared/types";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * `DataQualityReport` is logged into `system_logs` (module =
 * 'data-quality') rather than a dedicated table — see the header
 * comment in `supabase/migrations/0002_market_candles_provider_identity.sql`
 * for the reasoning.
 */
export async function logDataQualityReport(report: DataQualityReport): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const failedRules = report.rulesEvaluated.filter((r) => !r.passed).map((r) => r.rule);

  const { error } = await supabase.from("system_logs").insert({
    level: report.status === "FAIL" ? "ERROR" : report.status === "WARN" ? "WARN" : "INFO",
    module: "data-quality",
    message:
      `Data quality ${report.status} for ${report.market}/${report.timeframe} ` +
      `(${report.candleCount} candles)` +
      (failedRules.length > 0 ? `: ${failedRules.join(", ")}` : "."),
    context: report,
    occurred_at: report.evaluatedAt,
  });

  if (error) throw new Error(`Failed to log data quality report: ${error.message}`);
}

export async function getLatestDataQualityReport(
  market: Market,
  timeframe: Timeframe,
): Promise<DataQualityReport | undefined> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_logs")
    .select("context")
    .eq("module", "data-quality")
    .contains("context", { market, timeframe })
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to read latest data quality report: ${error.message}`);
  return data ? (data.context as DataQualityReport) : undefined;
}
