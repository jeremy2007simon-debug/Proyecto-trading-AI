import type { FinalSignal } from "@/core/signal-engine/types";
import type { MarketRegime } from "@/core/market-regime/types";

export type NotificationChannel = "TELEGRAM" | "EMAIL" | "IN_APP" | "WEBHOOK";

export type NotificationEventType =
  | "FINAL_SIGNAL_EMITTED"
  | "REGIME_CHANGED"
  | "RISK_LIMIT_REACHED"
  | "KILL_SWITCH_ACTIVATED"
  | "PAPER_TRADE_CLOSED";

export interface NotificationPayload {
  type: NotificationEventType;
  title: string;
  body: string;
  finalSignal?: FinalSignal;
  regime?: MarketRegime;
  occurredAt: string;
}

/**
 * Contract for the alerting layer. A notifier only ever formats and
 * sends what the pipeline already decided — it never itself decides to
 * alert on a signal the Risk Engine rejected as anything other than a
 * WAIT/rejection notice.
 */
export interface Notifier {
  readonly channel: NotificationChannel;

  send(payload: NotificationPayload): Promise<void>;
}
