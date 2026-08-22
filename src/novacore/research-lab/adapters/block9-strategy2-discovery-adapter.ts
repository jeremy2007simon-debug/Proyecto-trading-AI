import type { CumulativeTrialLedgerSummary, Strategy2DiscoveryFamily } from "@/novacore/research-lab/types";

/**
 * Block 9 — Strategy #2 Discovery & Pre-Registration. READ-ONLY,
 * transcribed from `docs/BLOCK9_STRATEGY2_DISCOVERY_REPORT.md` and
 * `results/block9/*.json` — never recomputed by this adapter or any
 * page that reads it. No backtest was run for any family listed here
 * (Block 9 Phase A stops at literature review + pre-registration, per
 * the brief's own §8/§29 STOP instruction) — nothing here is a
 * `ResearchProject` and nothing is wired into Strategy Hub or Bots.
 */
export const LITERATURE_FAMILIES_REVIEWED_COUNT = 20;

export const STRATEGY2_TOP5_FAMILIES: Strategy2DiscoveryFamily[] = [
  {
    rank: 1,
    letter: "D",
    name: "Overnight / Intraday Return Decomposition",
    evidenceGrade: "A",
    economicRationale: "Structural (close-concentrated index/ETF flow) + information diffusion (overnight news priced at the open) + institutional overnight risk transfer.",
    markets: "SPY, QQQ, IWM (extendable to DIA)",
    timeframe: "Daily entries/exits — overnight or intraday hold, never RS3M's monthly hold",
    dataFeasibility: "READY",
    executionFeasibility: "ALPACA_COMPATIBLE",
    expectedCorrelationWithRs3m: "LOW",
    tailRiskNote: "Ordinary overnight gap risk (no leverage, no options in the base design) — not a hidden tail.",
    crowdingRisk: "MEDIUM",
    decayRisk: "LOW-MEDIUM",
    score: 91,
    mainFalsificationRisk: "Gross-positive but net-negative after realistic SPY/QQQ costs — the same failure mode that killed 12/29 Block 8 FX configs.",
    sourceDoc: "docs/BLOCK9_STRATEGY2_DISCOVERY_REPORT.md §5",
  },
  {
    rank: 2,
    letter: "E",
    name: "Volatility Risk Premium",
    evidenceGrade: "A",
    economicRationale: "Risk premium — option sellers compensated for bearing crash/variance risk; behavioral overpayment for tail insurance adds to it.",
    markets: "SPY / VIX-linked instruments (SVXY, VXX, or SPY options)",
    timeframe: "Weekly-to-monthly option/ETP roll cycle",
    dataFeasibility: "READY",
    executionFeasibility: "ALPACA_COMPATIBLE",
    expectedCorrelationWithRs3m: "MEDIUM",
    tailRiskNote: "HIGH in naive/unhedged form (Feb-2018 XIV collapse is the canonical case) — only pre-registered as a MANDATORY defined-risk structure (put spread or hard-stopped ETP position), never naive short-vol.",
    crowdingRisk: "MEDIUM-HIGH",
    decayRisk: "LOW",
    score: 76,
    mainFalsificationRisk: "The defined-risk structure that makes this safe to test also caps the upside the naive literature figure shows — must clear a positive-net-edge bar AS STRUCTURED, not on the unhedged figure.",
    sourceDoc: "docs/BLOCK9_STRATEGY2_DISCOVERY_REPORT.md §5",
  },
  {
    rank: 3,
    letter: "M",
    name: "Turn-of-Month / Calendar Seasonality",
    evidenceGrade: "B",
    economicRationale: "Institutional rebalancing flows (payroll, pension/401(k) contributions, month-end rebalancing) concentrated at month boundaries.",
    markets: "SPY, QQQ, IWM, DIA",
    timeframe: "Monthly-recurring, 4-trading-day window",
    dataFeasibility: "READY",
    executionFeasibility: "ALPACA_COMPATIBLE",
    expectedCorrelationWithRs3m: "LOW",
    tailRiskNote: "LOW — long-only, brief holding window, no leverage.",
    crowdingRisk: "MEDIUM-HIGH",
    decayRisk: "HIGH",
    score: 89,
    mainFalsificationRisk: "This exact effect's own literature (McLean & Pontiff 2016) is the leading example of post-publication anomaly decay — pre-registration requires a dedicated most-recent-decade subperiod check, not just a full-sample average.",
    sourceDoc: "docs/BLOCK9_STRATEGY2_DISCOVERY_REPORT.md §5",
  },
  {
    rank: 4,
    letter: "F",
    name: "Defensive / Low-Volatility Equity",
    evidenceGrade: "A",
    economicRationale: "Institutional (leverage-constrained investors bid up high-beta names) + behavioral (lottery preference for high-volatility stocks).",
    markets: "SPY, QQQ, IWM, DIA (in-house tilt) or USMV/SPLV (listed factor ETFs)",
    timeframe: "Monthly-to-quarterly rebalance",
    dataFeasibility: "READY",
    executionFeasibility: "ALPACA_COMPATIBLE",
    expectedCorrelationWithRs3m: "MEDIUM",
    tailRiskNote: "LOW-MEDIUM — a defensive tilt should reduce, not add, left-tail exposure relative to the broad market.",
    crowdingRisk: "MEDIUM",
    decayRisk: "LOW",
    score: 88,
    mainFalsificationRisk: "Only a 4-ETF universe gives limited cross-sectional dispersion for a low-vol tilt to work with — the effect may lack room to express itself without a broader stock universe this project doesn't yet use.",
    sourceDoc: "docs/BLOCK9_STRATEGY2_DISCOVERY_REPORT.md §5",
  },
  {
    rank: 5,
    letter: "C",
    name: "Short-Term Reversal (large-liquid-ETF-only)",
    evidenceGrade: "B",
    economicRationale: "Liquidity provision (compensated for absorbing fire-sale order flow) + market microstructure overreaction to non-fundamental price moves.",
    markets: "SPY, QQQ, IWM, DIA",
    timeframe: "1-5 trading day hold, event-triggered",
    dataFeasibility: "READY",
    executionFeasibility: "ALPACA_COMPATIBLE",
    expectedCorrelationWithRs3m: "LOW",
    tailRiskNote: "MEDIUM — a reversal trade taken right after a large move can be wrong exactly when moves are largest ('falling knife') — disclosed, not hidden.",
    crowdingRisk: "MEDIUM",
    decayRisk: "MEDIUM",
    score: 79,
    mainFalsificationRisk: "The same literature supporting this family (Da, Liu & Schaumburg 2014) most directly warns that transaction costs erode the edge — the single most likely Top-5 family to reach REJECTED.",
    sourceDoc: "docs/BLOCK9_STRATEGY2_DISCOVERY_REPORT.md §5",
  },
];

export const CUMULATIVE_TRIAL_LEDGER_SUMMARY: CumulativeTrialLedgerSummary = {
  priorCumulativeFloor: "≥154",
  newTrialsThisBlock: 0,
  reconciledArithmetic: "5 + 42 + 24 + 29 + 24 + 30 = 154",
  policy: "Never reduced to flatter a future DSR. Any future Block 9-B deep backtest adds its own (pre-registered, max 20) configurations on top of this floor, never resets it.",
  sourceDoc: "results/block9/cumulative-trial-ledger.json",
};

export function getStrategy2FamilyByRank(rank: number): Strategy2DiscoveryFamily | undefined {
  return STRATEGY2_TOP5_FAMILIES.find((f) => f.rank === rank);
}
