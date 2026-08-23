import type { DailyReportDeliveryPayload, DailyReportDeliveryProvider } from "@/novacore/reports/daily-close/delivery/types";

/**
 * Block 10.1 §16/§17 — the NOVACORE_IN_APP delivery provider, the
 * minimum required by this block. "Delivery" for this channel is
 * already accomplished the moment the report is written by
 * `report-store.ts#writeReportIfAbsent` — `daily-report-event-adapter.ts`
 * (read-only) picks up every persisted report and surfaces it through
 * the shared Activity Feed, which the existing Notification Center
 * (`build-notifications.ts`) already renders. This provider's `deliver`
 * therefore does no additional write; it exists so the delivery
 * abstraction has at least one real implementation and so a future
 * provider is added the same way (implement `DailyReportDeliveryProvider`,
 * register it alongside this one) rather than by special-casing the
 * report engine itself.
 */
export function createNovaCoreInAppDeliveryProvider(): DailyReportDeliveryProvider {
  return {
    name: "novacore-in-app",
    async deliver(payload: DailyReportDeliveryPayload): Promise<void> {
      console.log(`[daily-report][novacore-in-app] Report for ${payload.report.date} is live in NovaCore (priority ${payload.priority}) — /novacore/reports/daily/${payload.report.date}`);
    },
  };
}

/**
 * Fans a payload out to every configured provider, isolating each
 * provider's failure — mirrors `createCaNotificationDispatcher`'s own
 * pattern in `scripts/block10/ca-shadow/notifications/dispatcher.ts`.
 */
export async function deliverDailyReport(payload: DailyReportDeliveryPayload, providers: readonly DailyReportDeliveryProvider[] = [createNovaCoreInAppDeliveryProvider()]): Promise<void> {
  await Promise.all(
    providers.map(async (provider) => {
      try {
        await provider.deliver(payload);
      } catch (err) {
        console.error(`[daily-report][${provider.name}] delivery threw: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );
}
