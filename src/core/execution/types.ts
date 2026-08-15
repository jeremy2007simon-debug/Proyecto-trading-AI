/**
 * CONCEPTUAL MODULE — NOT IMPLEMENTED, NOT WIRED UP, NOT CALLED.
 *
 * This file exists only so the Execution layer has a defined shape in
 * the architecture. Per product requirements, this first version of the
 * system MUST NOT:
 *   - connect to any real broker account
 *   - hold or read broker/API credentials
 *   - place, modify, or cancel any real order
 *
 * `ExecutionEngine` is intentionally left unimplemented. When real
 * execution is built (a separate, later, explicitly-approved phase), it
 * will consume a `FinalSignal` the exact same way `PaperTradingEngine`
 * does today — but that implementation, and the credential handling it
 * requires, must live entirely outside this first delivery.
 */
import type { FinalSignal } from "@/core/signal-engine/types";

export interface ExecutionOrderRequest {
  finalSignalId: string;
  market: string;
  direction: "BUY" | "SELL";
  positionSize: number;
  entry: number;
  stopLoss: number;
  takeProfit?: number;
}

export interface ExecutionOrderResult {
  accepted: boolean;
  brokerOrderId?: string;
  reason?: string;
}

/**
 * Contract a future real-execution adapter must satisfy. No class in
 * this codebase implements this interface yet, and none may be added
 * without a separate, explicit decision to enable real trading.
 */
export interface ExecutionEngine {
  readonly id: string;
  readonly isLiveTradingEnabled: false;

  submitOrder(signal: FinalSignal): Promise<ExecutionOrderResult>;
}
