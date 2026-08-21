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

/** Block 8 — the Forex Research Lab's 29-configuration funnel run across EUR/USD, GBP/USD, USD/JPY, AUD/USD. Completely independent of RS3M — no shared code, data, or conclusions. */
export const FOREX_RESEARCH_V1: ResearchProject = {
  id: "FOREX_RESEARCH_V1",
  name: "Forex Research Lab",
  objective:
    "Investigate whether a simple, reproducible FX strategy (EUR/USD, GBP/USD, USD/JPY, AUD/USD; 15m/30m/1h/4h) keeps a positive edge after realistic FX transaction costs (spread/slippage/swap), independently of RS3M.",
  createdAt: "2026-08-21",
  status: "COMPLETE",
  hypothesesTotal: 29,
  rejected: 29,
  research: 0,
  candidates: 0,
  constraints: [
    "Pre-registered 20-40 experiment budget (29 used), fixed before any result was inspected",
    "FX-specific pip-based cost model: OPTIMISTIC/REALISTIC/STRESSED spread+slippage+swap scenarios, never zero-cost presented as realistic",
    "No RS3M code, data, or parameters read, modified, or reused",
    "5 families: FX Trend/Momentum, FX Pullback in Trend, FX Volatility Breakout, FX Session Breakout, FX Controlled Mean Reversion",
  ],
  benchmarks: ["Zero-cost gross edge", "Chronological out-of-sample split", "Walk-forward (1h/4h only — 15m/30m dataset too short)"],
  notes:
    "All 29 configurations REJECTED — none survived Stage 3 (realistic FX cost). Closest near-miss: FX Volatility Breakout on AUD/USD 4h (zero-cost expectancyR +0.12, break-even cost ~2.4bps, WEAK cost robustness, only 51 trades) — real gross edge exists but is too thin for realistic retail/ECN spreads and too small a sample to trust. Decision: NO FOREX CANDIDATE — CONTINUE RESEARCH. See docs/BLOCK8_FOREX_RESEARCH_REPORT.md for the full funnel, cost scenarios, and data-quality writeup.",
  sourceDoc: "docs/BLOCK8_FOREX_RESEARCH_REPORT.md",
};

/** Block 8.2 — deep research on 5 economically-distinct FX hypotheses (factor momentum, carry+regime filter, diversified trend, multi-factor; Economic Momentum FX marked DATA_INSUFFICIENT — no vintage-aware macro data available). Independent code/data from both RS3M and Block 8's own intraday FX research. */
export const FX_TOP5_DEEP_RESEARCH: ResearchProject = {
  id: "FX_TOP5_DEEP_RESEARCH",
  name: "FX Top-5 Deep Research",
  objective:
    "Test 5 economically-distinct FX return sources (factor/regime momentum, carry with a crash-risk regime filter, diversified time-series trend, multi-factor carry+trend+value) on 7 major pairs over 15 years of daily data at monthly rebalance, using real central-bank rate and CPI data for carry/value construction.",
  createdAt: "2026-08-21",
  status: "COMPLETE",
  hypothesesTotal: 24,
  rejected: 13,
  research: 11,
  candidates: 0,
  constraints: [
    "Pre-registered 24-configuration budget across 4 executable families (Family 2, Economic Momentum, marked DATA_INSUFFICIENT before any code was written — no point-in-time macro data available)",
    "Real OBSERVED data for carry (FRED policy/interbank rates) and value (FRED CPI, PPP deviation) — never fabricated; spread/slippage/swap-markup remain ESTIMATED, kept structurally separate from OBSERVED figures",
    "GROSS and NET always reported together, plus OPTIMISTIC/REALISTIC/STRESSED cost scenarios",
    "Multiple-testing correction (Deflated Sharpe Ratio) computed across all 24 trials for every result mentioned as promising",
    "No RS3M or Block 8 code, data, or conclusions read, modified, or reused",
  ],
  benchmarks: ["Zero-cost gross edge", "Chronological 30% OOS holdout", "Monte Carlo bootstrap (10,000 sims) on realistic-cost monthly returns"],
  notes:
    "1 hypothesis (F3-E, unfiltered carry N=2) mechanically cleared the reused CANDIDATE classification gate (positive OOS, 60% walk-forward-majority, sufficient sample) but was DOWNGRADED to RESEARCH on independent review: Deflated Sharpe Ratio (24-trial correction) = 0.009 (statistically indistinguishable from zero skill), Monte Carlo ruin probability (≥50% max drawdown) = 62%, negative under STRESSED costs, and second-half-of-sample expectancy negative. The best-behaved single result overall was F5-E (Multi-Factor FX, full-universe risk-weighted) — Sharpe 0.28, positive under STRESSED costs, DSR = 0.499 (a coin flip, not evidence of skill) — RESEARCH tier, not promoted. Family 4 (Diversified Trend) was rejected uniformly (6/6, negative gross AND net for every lookback tested) — the cleanest, most unambiguous null result of the round. Two real implementation bugs (a regime-filter date-key mismatch, and an off-by-one look-ahead in one regime source) were caught and fixed during this round's own review before the final numbers below — see docs/BLOCK8_2_FX_TOP5_DEEP_RESEARCH_REPORT.md §10 for the full before/after audit trail.",
  sourceDoc: "docs/BLOCK8_2_FX_TOP5_DEEP_RESEARCH_REPORT.md",
};

export function listResearchProjects(): ResearchProject[] {
  return [ETF_ROTATION_RESEARCH, SP500_LEGACY_STRATEGY_RESEARCH, FOREX_RESEARCH_V1, FX_TOP5_DEEP_RESEARCH];
}

/** Block 8.2 §30 — per-family breakdown for the FX Research dashboard cards. Read-only observability, transcribed from `results/block8-2/experiments/*.json` — never recomputed by the page. */
export interface FxFamilySummary {
  family: string;
  status: "COMPLETE" | "DATA_INSUFFICIENT";
  experiments: number;
  bestGrossAnnualized: number | null;
  bestNetAnnualized: number | null;
  oosNote: string;
  robustnessNote: string;
  costSensitivityNote: string;
  candidateStatus: "REJECTED" | "RESEARCH" | "CANDIDATE" | "DATA_INSUFFICIENT";
}

export const FX_TOP5_FAMILY_SUMMARIES: FxFamilySummary[] = [
  {
    family: "1: FX Factor/Regime Momentum",
    status: "COMPLETE",
    experiments: 6,
    bestGrossAnnualized: 0.032,
    bestNetAnnualized: 0.024,
    oosNote: "Best config (F1-E, 6mo lookback/3mo hold) OOS +12.2%/yr, but only 20% of walk-forward windows positive.",
    robustnessNote: "No plateau — sign flips across lookbacks (1/3/6/12mo); DSR = 0.05 (indistinguishable from zero skill at 24 trials).",
    costSensitivityNote: "5/6 configs net-negative; only F1-E net-positive, and negative under STRESSED costs.",
    candidateStatus: "RESEARCH",
  },
  {
    family: "2: Economic Momentum FX",
    status: "DATA_INSUFFICIENT",
    experiments: 0,
    bestGrossAnnualized: null,
    bestNetAnnualized: null,
    oosNote: "Not run.",
    robustnessNote: "Not run.",
    costSensitivityNote: "Not run.",
    candidateStatus: "DATA_INSUFFICIENT",
  },
  {
    family: "3: Carry + Crash/Regime Filter",
    status: "COMPLETE",
    experiments: 6,
    bestGrossAnnualized: 0.048,
    bestNetAnnualized: 0.029,
    oosNote: "All 6 configs OOS-positive; walk-forward majority weak-to-moderate (40-60%).",
    robustnessNote: "Vol-regime HARD_EXIT filter (F3-B/C) genuinely improves Sharpe over unfiltered (F3-A) — real effect, verified after fixing a date-key bug.",
    costSensitivityNote: "Every config STRESSED-negative. F3-E mechanically cleared the CANDIDATE gate but DSR=0.009 and Monte Carlo ruin probability=62% — downgraded to RESEARCH on review.",
    candidateStatus: "RESEARCH",
  },
  {
    family: "4: Diversified Time-Series Trend",
    status: "COMPLETE",
    experiments: 6,
    bestGrossAnnualized: -0.009,
    bestNetAnnualized: -0.023,
    oosNote: "Not reached — every config REJECTED at the realistic-cost gate (Stage 4).",
    robustnessNote: "Uniformly negative across every lookback (1/3/6/12mo) and both universes (majors-only, full) — the cleanest null result of the round.",
    costSensitivityNote: "Negative gross AND net for all 6 configs — cost was never the deciding factor here, the signal itself has no edge in this sample.",
    candidateStatus: "REJECTED",
  },
  {
    family: "5: Multi-Factor FX",
    status: "COMPLETE",
    experiments: 6,
    bestGrossAnnualized: 0.082,
    bestNetAnnualized: 0.064,
    oosNote: "Best config (F5-E, full-universe risk-weighted) OOS +16.4%/yr, 40% of walk-forward windows positive.",
    robustnessNote: "F5-E is the only config positive in BOTH sample halves and under STRESSED costs — best-behaved single result of the round. DSR=0.499 (a coin flip, not evidence of skill).",
    costSensitivityNote: "5/6 configs net-positive at REALISTIC cost, but only F5-E survives STRESSED costs.",
    candidateStatus: "RESEARCH",
  },
];

export function getResearchProjectById(id: string): ResearchProject | undefined {
  return listResearchProjects().find((p) => p.id === id);
}
