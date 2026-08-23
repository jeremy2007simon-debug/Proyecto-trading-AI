import type { CaNotificationEvent } from "@/core/ca-shadow/notification-events";

/** A notification channel. Adapters are additive and independent — a failing/unconfigured one never blocks another or the caller (see `dispatcher.ts`). */
export interface CaNotificationAdapter {
  name: string;
  send(event: CaNotificationEvent): Promise<void>;
}
