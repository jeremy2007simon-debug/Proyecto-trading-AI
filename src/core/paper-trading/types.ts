import type { MarketRegime } from "@/core/market-regime/types";
import type { FinalSignal } from "@/core/signal-engine/types";
import type {
  ISOTimestamp,
  Market,
  SignalDirection,
  Timeframe,
} from "@/core/shared/types";

export type TradeStatus = "OPEN" | "CLOSED" | "CANCELLED";
export type ExitReason = "TAKE_PROFIT" | "STOP_LOSS" | "MANUAL_CLOSE" | "TIME_EXIT";

/**
 * A simulated position opened from an approved `FinalSignal`. This is
 * the ONLY module allowed to simulate order fills; it never talks to a
 * broker and never touches real money. Every trade keeps a reference to
 * the strategies, regime, consensus score and risk decision that
 * produced it so results can be audited and attributed later.
 */
export interface PaperTrade {
  id: string;
  finalSignalId: string;
  market: Market;
  timeframe: Timeframe;
  direction: Extract<SignalDirection, "BUY" | "SELL">;

  entryPrice: number;
  stopLoss: number;
  takeProfit?: number;
  positionSize: number;
  commission: number;
  slippage: number;

  openedAt: ISOTimestamp;
  closedAt?: ISOTimestamp;
  exitPrice?: number;
  exitReason?: ExitReason;
  pnlAmount?: number;
  pnlR?: number;
  status: TradeStatus;

  /** Denormalized audit context, captured at open time. */
  marketRegime: MarketRegime;
  consensusScore: number;
  participatingStrategyIds: string[];
}

export interface PaperTradingAccountState {
  equity: number;
  openPositions: PaperTrade[];
  tradesTakenToday: number;
  realizedPnlPctToday: number;
}

/**
 * Contract for the Paper Trading engine. Only ever opens a position from
 * a `FinalSignal` whose `direction` is BUY/SELL and whose `risk.approved`
 * is true — this must be re-checked here, not assumed from upstream.
 */
export interface PaperTradingEngine {
  readonly id: string;

  getAccountState(): PaperTradingAccountState;
  openFromSignal(signal: FinalSignal): PaperTrade | undefined;
  markToMarket(currentPrice: number, market: Market): void;
  closeTrade(tradeId: string, exitPrice: number, reason: ExitReason): PaperTrade;
}
