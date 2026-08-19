import type { ResearchProject } from "@/novacore/research-lab/types";

/**
 * Block 7 — Research Lab entries, TRANSCRIBED (never recomputed) from the
 * frozen Block 4 / 4.5 / 5 reports. Counts are copied by hand from each
 * report's own summary tables and cited via `sourceDoc` — this file does
 * not parse markdown or re-run any research script.
 */

/** Block 3/4/4.5 — the five original SP500 strategies + their deep-validation follow-up. */
export const SP500_LEGACY_STRATEGY_RESEARCH: ResearchProject = {
  id: "SP500_LEGACY_STRATEGY_RESEARCH",
  name: "SP500 Legacy Strategy Research",
  objective: "Backtest the five initial Strategy Manager strategies (Trend Following, Breakout, Mean Reversion, Opening Range Breakout, VWAP) against 2 years of real SPY data and validate the two with positive gross edge.",
  createdAt: "2026-08-16",
  status: "COMPLETE",
  hypothesesTotal: 5,
  rejected: 5,
  research: 0,
  candidates: 0,
  constraints: ["Real 2-year SPY backtest", "Realistic commission + slippage", "No parameter optimization to force a pass"],
  benchmarks: ["SPY buy-and-hold"],
  notes:
    "All 5 strategies rejected in Block 4 (§15: ranked -0.58 to -1.29 expectancyR, none positive). Mean Reversion and Opening Range Breakout — the only two with any positive gross/zero-cost edge — were taken through Block 4.5's full 9-stage validation funnel (42+ parameter/timeframe/asset combinations) and confirmed REJECTED at realistic cost in both full-period and out-of-sample windows (§15: \"NO VALID STRATEGY FOUND\"). No combination reached RESEARCH or CANDIDATE.",
  sourceDoc: "docs/BLOCK4_BACKTESTING_REPORT.md §15, §21-25; docs/BLOCK4_5_STRATEGY_RESEARCH_REPORT.md §15",
};

/** Block 5 — the 8-family strategy discovery run that produced RS3M_CANDIDATE_V1. */
export const ETF_ROTATION_RESEARCH: ResearchProject = {
  id: "ETF_ROTATION_RESEARCH",
  name: "ETF Rotation Research",
  objective: "Apply a 9-stage, anti-overfitting validation funnel to 8 genuinely new strategy families (not derived from the rejected Mean Reversion/ORB) across SPY/QQQ/IWM/DIA.",
  createdAt: "2026-08-17",
  status: "COMPLETE",
  hypothesesTotal: 24,
  rejected: 22,
  research: 1,
  candidates: 1,
  constraints: ["Pre-registered 20-50 experiment budget", "No parameter tuning after seeing OOS/walk-forward results", "9-stage funnel: Sanity, Zero-cost, Costs, Long history, OOS, Walk-forward, Cross-asset, Regime, Monte Carlo"],
  benchmarks: ["SPY buy-and-hold", "Equal-weight SPY/QQQ/IWM/DIA"],
  notes:
    "22 standard-funnel configurations (Momentum/Trend, Pullback, Volatility Breakout, Gap/Overnight, Intraday Seasonality, Volatility Regime, Pairs) all REJECTED — none survived even Stage 3 (costs). Of the 2 Relative Strength configurations: 3-month lookback reached CANDIDATE (this became RS3M_CANDIDATE_V1 in Block 6) and 6-month lookback reached RESEARCH only (margin too thin — see §20). This CANDIDATE is the only strategy that has ever proceeded to Block 6/7.",
  sourceDoc: "docs/BLOCK5_STRATEGY_DISCOVERY_REPORT.md §1-10",
};

export function listResearchProjects(): ResearchProject[] {
  return [ETF_ROTATION_RESEARCH, SP500_LEGACY_STRATEGY_RESEARCH];
}

export function getResearchProjectById(id: string): ResearchProject | undefined {
  return listResearchProjects().find((p) => p.id === id);
}
