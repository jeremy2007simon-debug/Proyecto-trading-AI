import { formatCaNotificationMessage } from "@/core/ca-shadow/notification-events";
import type { CaNotificationAdapter } from "./adapter";

/** Always-on default adapter — every C-A shadow event lands in stdout/CI logs even with no external channel configured. */
export function createCaConsoleAdapter(): CaNotificationAdapter {
  return {
    name: "console",
    async send(event) {
      console.log(formatCaNotificationMessage(event));
    },
  };
}
