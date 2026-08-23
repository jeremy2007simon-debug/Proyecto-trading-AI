import type { CaNotificationEvent } from "@/core/ca-shadow/notification-events";
import { createCaConsoleAdapter } from "./console-adapter";
import type { CaNotificationAdapter } from "./adapter";

export interface CaNotificationDispatcher {
  notify(event: CaNotificationEvent): Promise<void>;
}

/** Fans an event out to every configured adapter, IN PARALLEL, isolating each adapter's failure from the others and from the caller — a broken channel must never take down the shadow routine script itself. */
export function createCaNotificationDispatcher(adapters: readonly CaNotificationAdapter[]): CaNotificationDispatcher {
  return {
    async notify(event: CaNotificationEvent): Promise<void> {
      await Promise.all(
        adapters.map(async (adapter) => {
          try {
            await adapter.send(event);
          } catch (err) {
            console.error(`[ca-shadow-notifications:${adapter.name}] adapter threw: ${err instanceof Error ? err.message : String(err)}`);
          }
        }),
      );
    },
  };
}

/** Console-only by default. Unlike RS3M's paper-trading dispatcher, no external channel is wired up here — §15 requires notifications to exist, not a specific delivery channel, and a shadow-only system does not need to wake anyone urgently (no order, no money, no approval gate). */
export function createDefaultCaNotificationDispatcher(): CaNotificationDispatcher {
  return createCaNotificationDispatcher([createCaConsoleAdapter()]);
}
