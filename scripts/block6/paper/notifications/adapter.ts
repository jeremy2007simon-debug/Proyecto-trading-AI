import type { Rs3mNotificationEvent } from "@/core/paper-trading/rs3m/notification-events";

/** A notification channel. Adapters are additive and independent — a failing/unconfigured one never blocks another or the caller (see `dispatcher.ts`). */
export interface NotificationAdapter {
  name: string;
  send(event: Rs3mNotificationEvent): Promise<void>;
}
