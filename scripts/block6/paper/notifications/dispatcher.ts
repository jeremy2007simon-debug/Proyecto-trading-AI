import type { Rs3mNotificationEvent } from "@/core/paper-trading/rs3m/notification-events";
import { createConsoleAdapter } from "./console-adapter";
import { createTelegramAdapter } from "./telegram-adapter";
import type { NotificationAdapter } from "./adapter";

export interface NotificationDispatcher {
  notify(event: Rs3mNotificationEvent): Promise<void>;
}

/** Fans an event out to every configured adapter, IN PARALLEL, isolating each adapter's failure from the others and from the caller — a broken Telegram webhook must never take down the console log or (more importantly) the rebalance script itself. */
export function createNotificationDispatcher(adapters: readonly NotificationAdapter[]): NotificationDispatcher {
  return {
    async notify(event: Rs3mNotificationEvent): Promise<void> {
      await Promise.all(
        adapters.map(async (adapter) => {
          try {
            await adapter.send(event);
          } catch (err) {
            console.error(`[notifications:${adapter.name}] adapter threw: ${err instanceof Error ? err.message : String(err)}`);
          }
        }),
      );
    },
  };
}

/** Console is always on; Telegram (or any future channel) is added only when its env credentials are present — see `createTelegramAdapter`. */
export function createDefaultNotificationDispatcher(): NotificationDispatcher {
  const adapters: NotificationAdapter[] = [createConsoleAdapter()];
  const telegram = createTelegramAdapter();
  if (telegram) adapters.push(telegram);
  return createNotificationDispatcher(adapters);
}
