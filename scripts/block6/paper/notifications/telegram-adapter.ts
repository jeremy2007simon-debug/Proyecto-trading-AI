import { formatNotificationMessage } from "@/core/paper-trading/rs3m/notification-events";
import type { NotificationAdapter } from "./adapter";

/**
 * Optional Telegram channel — configured entirely via env
 * (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`), never hardcoded, never
 * logged. `createTelegramAdapter()` returns `undefined` (not a throwing
 * adapter) when either is missing, so the system runs fine on console-only
 * output until a human adds credentials — see the spec's "deja adapters
 * configurables sin bloquear el sistema."
 */
export function createTelegramAdapter(env: Partial<NodeJS.ProcessEnv> = process.env): NotificationAdapter | undefined {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return undefined;

  return {
    name: "telegram",
    async send(event) {
      const text = formatNotificationMessage(event);
      try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text }),
        });
        if (!response.ok) {
          // Never include botToken/chatId in this log line.
          console.error(`[notifications:telegram] Telegram API returned ${response.status}.`);
        }
      } catch (err) {
        console.error(`[notifications:telegram] send failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}
