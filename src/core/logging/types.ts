export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL";

/**
 * Canonical set of events the system must log, per the audit
 * requirements in the product spec. Using a closed union (instead of a
 * free-form string) keeps `system_logs.module`/messages queryable and
 * prevents ad-hoc, inconsistent event naming across modules.
 */
export type SystemEvent =
  | "MARKET_REGIME_CHANGED"
  | "STRATEGY_ACTIVATED"
  | "STRATEGY_DISABLED"
  | "STRATEGY_SIGNAL_GENERATED"
  | "CONSENSUS_CALCULATED"
  | "SIGNAL_CONFLICT_DETECTED"
  | "FINAL_SIGNAL_GENERATED"
  | "SIGNAL_REJECTED"
  | "RISK_LIMIT_REACHED"
  | "TRADE_OPENED"
  | "TRADE_CLOSED"
  | "STOP_LOSS_TRIGGERED"
  | "TAKE_PROFIT_TRIGGERED"
  | "KILL_SWITCH_ACTIVATED"
  | "API_ERROR"
  | "MARKET_DATA_ERROR";

export interface LogEntry {
  level: LogLevel;
  module: string;
  event?: SystemEvent;
  message: string;
  context: Record<string, unknown>;
  occurredAt: string;
}

/**
 * Contract for the logging module. Every other module depends on this
 * interface, never on a concrete transport, so log storage can move from
 * `system_logs` to an external sink later without touching call sites.
 */
export interface Logger {
  log(entry: Omit<LogEntry, "occurredAt">): void;
  debug(module: string, message: string, context?: Record<string, unknown>): void;
  info(module: string, message: string, context?: Record<string, unknown>): void;
  warn(module: string, message: string, context?: Record<string, unknown>): void;
  error(module: string, message: string, context?: Record<string, unknown>): void;
  critical(module: string, message: string, context?: Record<string, unknown>): void;
}
