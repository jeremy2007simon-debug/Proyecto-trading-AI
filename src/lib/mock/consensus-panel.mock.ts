import type { MarketRegime } from "@/core/market-regime/types";
import type { Market, SignalDirection, Timeframe } from "@/core/shared/types";
import { mockCurrentRegime } from "@/lib/mock/strategy-matrix.mock";

/**
 * MOCK DATA — clearly flagged, see strategy-matrix.mock.ts. Values here
 * are internally consistent with `mockStrategyMatrixRows`
 * (buyWeight/sellWeight/waitWeight sum to 1, conflictScore =
 * 2*min(buyWeight, sellWeight)) so the panel reads as a believable
 * illustration of `ConsensusResult`, not arbitrary numbers.
 */
export const IS_MOCK_DATA = true as const;

export interface ConsensusPanelData {
  market: Market;
  timeframe: Timeframe;
  marketRegime: MarketRegime;
  consensusScore: number;
  buyWeight: number;
  sellWeight: number;
  waitWeight: number;
  conflictScore: number;
  riskApproved: boolean;
  riskRejectionReason?: string;
  finalDecision: SignalDirection;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;
  price: number;
  timestamp: string;
}

export const mockConsensusPanelData: ConsensusPanelData = {
  market: "SP500",
  timeframe: "15m",
  marketRegime: mockCurrentRegime,
  consensusScore: 45,
  buyWeight: 0.55,
  sellWeight: 0.1,
  waitWeight: 0.35,
  conflictScore: 0.2,
  riskApproved: true,
  finalDecision: "BUY",
  entry: 5482.25,
  stopLoss: 5468.5,
  takeProfit: 5510.0,
  riskReward: 2.02,
  price: 5482.25,
  timestamp: new Date().toISOString(),
};
