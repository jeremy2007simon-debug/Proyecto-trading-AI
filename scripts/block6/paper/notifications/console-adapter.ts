import { formatNotificationMessage } from "@/core/paper-trading/rs3m/notification-events";
import type { NotificationAdapter } from "./adapter";

/** Always-on default adapter — every event lands in stdout/CI logs even with no external channel configured. */
export function createConsoleAdapter(): NotificationAdapter {
  return {
    name: "console",
    async send(event) {
      console.log(formatNotificationMessage(event));
    },
  };
}
