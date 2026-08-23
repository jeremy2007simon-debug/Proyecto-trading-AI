import type { NovaCoreDailyCloseReport } from "@/novacore/reports/daily-close/types";

/**
 * Block 10.1 §16 — delivery abstraction, so the report engine is never
 * hardcoded to one channel. Additive: implement one more provider per
 * channel (push, email, Telegram, Discord, ...) without touching the
 * report engine, the orchestrator, or any existing provider. This block
 * implements ONLY `NOVACORE_IN_APP` (see `novacore-in-app-provider.ts`)
 * — no other provider is invented, and none of the others below are
 * wired up (§16: "no invente credenciales/API keys").
 */
export type DailyReportPriority = "INFO" | "IMPORTANT" | "CRITICAL";

export interface DailyReportDeliveryPayload {
  report: NovaCoreDailyCloseReport;
  priority: DailyReportPriority;
}

export interface DailyReportDeliveryProvider {
  name: string;
  deliver(payload: DailyReportDeliveryPayload): Promise<void>;
}
