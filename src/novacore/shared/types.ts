import type { ISOTimestamp, Result } from "@/core/shared/types";

export type { ISOTimestamp, Result };

/**
 * NovaCore control-plane primitives (Block 7).
 *
 * Everything in `src/novacore/**` is a CONTROL/OBSERVABILITY layer on top
 * of the existing Block 1-6 domain engine (`src/core/**`, `scripts/**`).
 * It never reimplements strategy logic, never writes to any Block 1-6
 * store, and never calls a broker write endpoint. See
 * `docs/BLOCK7_NOVACORE_TRADING_LAB.md` section "Source of truth" for the
 * authoritative-source map every adapter in this tree follows.
 */

/**
 * Conceptual lifecycle a strategy moves through inside NovaCore. This is a
 * NovaCore-level classification for display/control purposes only — it
 * does not replace or drive `Rs3mStatus`
 * (`src/core/paper-trading/rs3m/status.ts`), which remains the sole
 * authoritative state machine for RS3M itself. `LIVE`/`LIVE_ELIGIBLE` are
 * represented here only as type-level possibilities for a future
 * strategy; nothing in this codebase can currently produce them (LIVE
 * trading has no implementation anywhere — see `src/core/execution/types.ts`
 * and `alpaca-paper-client.ts`'s structural paper-only guarantee).
 */
export type NovaCoreStrategyStatus =
  | "RESEARCH"
  | "REJECTED"
  | "CANDIDATE"
  | "PAPER_READY"
  | "PAPER_RUNNING"
  | "FORWARD_VERIFIED"
  | "LIVE_ELIGIBLE"
  | "LIVE";

export type NovaCoreEnvironment = "RESEARCH" | "PAPER" | "LIVE";

/**
 * System/component health — deliberately NOT a measure of strategy
 * performance. A strategy can be losing money and still be HEALTHY (its
 * automation runs correctly, data is fresh, the broker connection works);
 * conversely a strategy with a great historical edge can be DEGRADED if
 * its Routine is failing or its data feed is stale. See
 * `src/novacore/health/aggregator.ts`.
 */
export type HealthStatus = "HEALTHY" | "WARNING" | "DEGRADED" | "ERROR" | "OFFLINE";

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  detail: string;
  /** ISO timestamp this specific check was last evaluated/observed, when known. */
  observedAt?: ISOTimestamp;
}

export interface HealthSummary {
  status: HealthStatus;
  checks: HealthCheck[];
}

export interface StrategyPerformance {
  /** Historical (backtest) metrics, transcribed from a frozen research report — never recomputed by NovaCore. */
  historical?: {
    totalReturnPct: number;
    cagrPct: number;
    volatilityPct?: number;
    maxDrawdownPct: number;
    sharpe?: number;
    sortino?: number;
    calmar?: number;
    benchmarkReturnPct?: number;
    excessReturnPct?: number;
    periodStart: string;
    periodEnd: string;
    sourceDoc: string;
  };
  /** Forward (live paper) metrics, derived from real, persisted forward evidence only — `undefined` fields (not zeros) when no evidence exists yet. */
  forward?: {
    monthsObserved: number;
    totalReturnPct?: number;
    cagrPct?: number;
    maxDrawdownPct?: number;
    benchmarkReturnPct?: number;
    excessReturnPct?: number;
    sourceDoc: string;
  };
}

export interface StrategyRisk {
  currentDrawdownPct?: number;
  historicalMaxDrawdownPct?: number;
  forwardMaxDrawdownPct?: number;
  turnover?: number;
  ordersRejected?: number;
  ordersPartialFill?: number;
  executionErrors?: number;
}

/**
 * A single strategy as represented in the NovaCore Strategy Hub. This is
 * intentionally close to (but not identical to) the interface sketched in
 * the Block 7 brief — extensible, and every optional field is optional
 * because NovaCore must never fabricate a value it doesn't have real
 * evidence for.
 */
export interface NovaCoreStrategy {
  id: string;
  version: string;
  name: string;
  family: string;
  status: NovaCoreStrategyStatus;

  broker?: string;
  environment?: NovaCoreEnvironment;

  candidateHash?: string;

  hypothesis: string;

  performance?: StrategyPerformance;
  risk?: StrategyRisk;
  health?: HealthSummary;

  /** Where each field on this record ultimately comes from — always populated, never blank, per the Block 7 "source of truth" requirement. */
  sourceOfTruth: Record<string, string>;
}
