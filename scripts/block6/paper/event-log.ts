/**
 * Block 6, Fase 26 — structured event log for the RS3M paper-trading
 * path. Reuses the pattern already established in this repo for
 * "log a structured system event" (`system_logs` via
 * `data-quality-log.ts`/`strategy-manager-log.ts`) but file-based instead
 * of Supabase, since the plan puts ALL Block 6 forward/paper state under
 * `results/block6/**` — writing to Supabase too would be unrequested
 * scope. One JSON object per line (JSONL) in
 * `results/block6/paper/events.log`, append-only.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type Rs3mEventType =
  | "NO_OP_NOT_TRADING_DAY"
  | "NO_OP_ALREADY_EXECUTED"
  | "SIGNAL_COMPUTED"
  | "REBALANCE_PENDING"
  | "SAFEGUARD_TRIGGERED"
  | "ORDERS_SUBMITTED"
  | "ORDER_PARTIAL_OR_FAILED"
  | "ERROR"
  | "MONTHLY_PERFORMANCE";

export interface Rs3mEvent {
  type: Rs3mEventType;
  timestamp: string;
  detail: Record<string, unknown>;
}

const EVENTS_LOG_PATH = join(process.cwd(), "results", "block6", "paper", "events.log");

export function appendEvent(type: Rs3mEventType, detail: Record<string, unknown>): void {
  mkdirSync(join(process.cwd(), "results", "block6", "paper"), { recursive: true });
  const event: Rs3mEvent = { type, timestamp: new Date().toISOString(), detail };
  appendFileSync(EVENTS_LOG_PATH, `${JSON.stringify(event)}\n`);
  console.log(`[event] ${type}`, detail);
}
