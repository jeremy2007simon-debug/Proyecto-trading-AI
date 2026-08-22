import type { CandidateVerificationStatus, ResearchProject } from "@/novacore/research-lab/types";

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

/** Block 8.3 — deep research on 5 economically-distinct US-index hypotheses (volatility-managed exposure, intraday momentum, regime-dependent trend/pullback, cross-index rotation, hybrid momentum-contrarian) on SPY/QQQ/IWM/DIA. Every candidate is additionally screened for Deflated Sharpe Ratio and correlation vs RS3M_CANDIDATE_V1 — a mechanical CANDIDATE that fails either check is downgraded to RESEARCH, exactly the same override discipline Block 8.2 applied to F3-E. */
export const US_INDEX_TOP5_DEEP_RESEARCH: ResearchProject = {
  id: "US_INDEX_TOP5_DEEP_RESEARCH",
  name: "US Index Top-5 Deep Research",
  objective:
    "Test 5 economically-distinct US-index return sources (volatility-managed exposure, intraday opening-directional-persistence momentum, regime-filtered trend/pullback, cross-index rotation, hybrid momentum-contrarian) on SPY/QQQ/IWM/DIA over up to 33 years of daily data (2 years for the intraday family, Yahoo's own ceiling for hourly bars), with every candidate additionally screened for multiple-testing-corrected significance (DSR) and correlation vs RS3M_CANDIDATE_V1.",
  createdAt: "2026-08-22",
  status: "COMPLETE",
  hypothesesTotal: 30,
  // 1 true REJECTED (R3-E) + 6 DATA_INSUFFICIENT (Family 2 — sample-size floor never reached, see `US_INDEX_TOP5_FAMILY_SUMMARIES`'s per-family `status`) grouped here since neither survives to RESEARCH/CANDIDATE; the family cards below distinguish "tested and failed" from "couldn't be tested properly."
  rejected: 7,
  research: 22,
  candidates: 1,
  constraints: [
    "Pre-registered 30-configuration budget (6 per family), fixed before any result was inspected",
    "Alpaca Market Data tried first — confirmed unusable (401 Unauthorized, no Data API credentials configured); Yahoo Finance used as the same documented fallback Block 8/8.2 already use, with an explicit adjusted-vs-raw-close test guarding against the prior unadjusted-price bug",
    "GROSS and NET always reported together, plus OPTIMISTIC/REALISTIC/STRESSED cost scenarios (separate SWING vs INTRADAY tiers)",
    "Deflated Sharpe Ratio computed per-methodology-pool (daily-native Families 1/3/4/5 vs trade-based Family 2 — never pooled together, which would conflate incompatible Sharpe units)",
    "Every mechanical CANDIDATE additionally screened for correlation vs RS3M_CANDIDATE_V1 (reconstructed read-only via RS3M's own unmodified engine, used only as a benchmark) — LOW diversification value (|corr| > 0.6) downgrades to RESEARCH",
    "No RS3M code, data, or parameters modified — read-only benchmark reconstruction only",
  ],
  benchmarks: ["SPY buy-and-hold", "QQQ buy-and-hold", "Equal-weight SPY/QQQ/IWM/DIA", "RS3M_CANDIDATE_V1 (benchmark only, never reused as logic)"],
  notes:
    "Only 1 of 30 configurations survives full scrutiny: R3-B (Family 3, SPY, pullback-in-uptrend gated by a long-term-trend regime filter) — DSR 0.96, correlation vs RS3M only 0.11 (a genuine diversifier), net CAGR 2.4%/yr with a 10.7% max drawdown. A combined RS3M+R3-B 50/50 portfolio improves Sharpe from 0.74 to 0.84 and cuts max drawdown from 65% to 37% versus RS3M alone. Two families that mechanically cleared the CANDIDATE gate were downgraded on review: Family 1 (Volatility-Managed Exposure, 5/6 mechanical CANDIDATEs, DSR up to 1.0) is statistically the strongest standalone result of the round but correlates 0.79-0.82 with RS3M (LOW diversification value, fails the independence bar). Family 4 (Cross-Index Rotation, 6/6 mechanical CANDIDATEs, DSR up to 1.0) correlates 0.90-0.95 with RS3M — every lookback/ranking/weighting variant tested ends up being, in practice, nearly the same trade as RS3M under different plumbing, exactly the risk this round's brief warned about. Family 5 (Hybrid Momentum-Contrarian) has DSR = 0.00 for every config — indistinguishable from luck after multiple-testing correction. Family 2 (Intraday Momentum) is DATA_INSUFFICIENT: Yahoo's 60-day ceiling for sub-hourly bars and ~2-year ceiling for 1h bars leaves every configuration below the 36-month sanity floor, and the underlying economics were net-negative at realistic intraday cost regardless.",
  sourceDoc: "docs/BLOCK8_3_US_INDEX_TOP5_DEEP_RESEARCH_REPORT.md",
};

export function listResearchProjects(): ResearchProject[] {
  return [ETF_ROTATION_RESEARCH, SP500_LEGACY_STRATEGY_RESEARCH, FOREX_RESEARCH_V1, FX_TOP5_DEEP_RESEARCH, US_INDEX_TOP5_DEEP_RESEARCH];
}

/** Block 8.3 §28 — per-family breakdown for the US Index Research dashboard cards. Read-only observability, transcribed from `results/block8-3/experiments/*.json` and `results/block8-3/multiple-testing/review.json` — never recomputed by the page. */
export interface UsIndexFamilySummary {
  family: string;
  status: "COMPLETE" | "DATA_INSUFFICIENT";
  experiments: number;
  bestGrossAnnualizedPct: number | null;
  bestNetAnnualizedPct: number | null;
  oosNote: string;
  maxDrawdownNote: string;
  costMarginNote: string;
  correlationVsRs3mNote: string;
  candidateStatus: "REJECTED" | "RESEARCH" | "CANDIDATE" | "DATA_INSUFFICIENT";
}

export const US_INDEX_TOP5_FAMILY_SUMMARIES: UsIndexFamilySummary[] = [
  {
    family: "1: Volatility-Managed Equity Exposure",
    status: "COMPLETE",
    experiments: 6,
    bestGrossAnnualizedPct: 10.73,
    bestNetAnnualizedPct: 10.6,
    oosNote: "5/6 configs mechanically clear CANDIDATE (positive OOS, majority walk-forward, DSR up to 1.0) — the round's strongest standalone statistical result.",
    maxDrawdownNote: "Realized-vol-target configs (10-15%/yr) show a genuine parameter plateau: Sharpe 0.81-0.84 across every target/lookback combination on SPY. ATR-proxy variant (V1-F) is materially weaker (DSR 0.23).",
    costMarginNote: "Positive throughout the full 0-12bps tested range — SWING rebalance turnover is cheap on these four ETFs.",
    correlationVsRs3mNote: "0.79-0.82 with RS3M — LOW diversification value. Downgraded to RESEARCH: statistically real, but not a useful Strategy #2 alongside RS3M.",
    candidateStatus: "RESEARCH",
  },
  {
    family: "2: Intraday Momentum",
    status: "DATA_INSUFFICIENT",
    experiments: 6,
    bestGrossAnnualizedPct: 8.47,
    bestNetAnnualizedPct: -5.5,
    oosNote: "Not reached — every config fails the 36-month sample-size sanity floor (Yahoo's 60-day/2-year ceilings for sub-hourly/hourly bars).",
    maxDrawdownNote: "Not computed — Stage-1 sanity failure stops the funnel before deeper stages, per the fail-fast convention.",
    costMarginNote: "Net-negative at realistic intraday cost for every config even before the sample-size problem — gross edge exists but is thin relative to a 4bps round-trip.",
    correlationVsRs3mNote: "Not computed (never reached that stage).",
    candidateStatus: "DATA_INSUFFICIENT",
  },
  {
    family: "3: Regime-Dependent Trend/Pullback",
    status: "COMPLETE",
    experiments: 6,
    bestGrossAnnualizedPct: 2.53,
    bestNetAnnualizedPct: 2.41,
    oosNote: "R3-B (SPY, LONG_TERM_TREND filter) OOS-positive, 55.6% walk-forward-positive (10/18 windows), DSR 0.96.",
    maxDrawdownNote: "10.7% net MaxDD — the shallowest of any config in this round. Regime-filter choice is NOT a smooth plateau: the LONG_TERM_TREND filter helps (R3-A -> R3-B improves Sharpe 0.60 -> 0.71), but the VOL_REGIME filter (alone or combined) collapses Sharpe to ~0.27 — a real, disclosed asymmetry, not full robustness.",
    costMarginNote: "Positive throughout the full 0-12bps tested range.",
    correlationVsRs3mNote: "0.11-0.15 with RS3M — HIGH diversification value. The round's only genuine survivor.",
    candidateStatus: "CANDIDATE",
  },
  {
    family: "4: Cross-Index Relative Strength/Rotation",
    status: "COMPLETE",
    experiments: 6,
    bestGrossAnnualizedPct: 13.83,
    bestNetAnnualizedPct: 13.36,
    oosNote: "6/6 configs mechanically clear CANDIDATE — DSR 0.96-1.0, the highest statistical confidence of any family this round.",
    maxDrawdownNote: "44-63% net MaxDD (Monte Carlo P95 up to 63%) — substantially deeper than RS3M's own historical drawdown profile.",
    costMarginNote: "Positive throughout the full 0-12bps tested range.",
    correlationVsRs3mNote: "0.90-0.95 with RS3M — LOW diversification value. Downgraded to RESEARCH: every shorter-lookback/risk-adjusted/blended variant tested ends up nearly the same trade as RS3M, exactly the risk this family's own pre-registered invalidation criterion flagged.",
    candidateStatus: "RESEARCH",
  },
  {
    family: "5: Hybrid Momentum-Contrarian",
    status: "COMPLETE",
    experiments: 6,
    bestGrossAnnualizedPct: 3.7,
    bestNetAnnualizedPct: 3.29,
    oosNote: "5/6 configs mechanically clear CANDIDATE, but Deflated Sharpe Ratio = 0.00 for every single config in the family.",
    maxDrawdownNote: "47-62% net MaxDD, Monte Carlo probability of terminal loss up to 6.5% — a materially worse risk profile than Families 1 or 3.",
    costMarginNote: "Positive throughout the full 0-12bps tested range.",
    correlationVsRs3mNote: "0.58-0.66 with RS3M — MEDIUM/LOW diversification value.",
    candidateStatus: "RESEARCH",
  },
];

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

/**
 * Block 8.4 — R3-B independent verification outcome. READ-ONLY,
 * transcribed from `docs/BLOCK8_4_R3B_INDEPENDENT_VERIFICATION_REPORT.md`
 * and `results/block8-4/statistical-validation/invalidation-criteria-and-
 * decision.json`, never recomputed by this adapter or any page that
 * reads it. R3-B was REJECTED — not wired into Strategy Hub (the brief's
 * own §26 only allows that "si sobrevive," which it did not) and no
 * `R3B_CANDIDATE_V1` was ever frozen.
 */
export const R3B_VERIFICATION: CandidateVerificationStatus = {
  candidateId: "R3-B",
  sourceProject: "US_INDEX_TOP5_DEEP_RESEARCH (Block 8.3, Family 3)",
  verificationStatus: "REJECTED",
  netCagrPct: 2.41,
  oosNote: "OOS CAGR +3.40%/yr, BETTER than in-sample's +1.99%/yr on every metric. Rolling (expanding-window) OOS: 77.8% of windows positive (21/27).",
  walkForwardNote: "10/18 windows positive (55.6%) — independently reproduced exactly. Distribution: best +14.1%, worst -8.2%, median +1.1% — a modest median with wide spread.",
  maxDrawdownPct: 10.68,
  dsrNote: "DSR = 0.96 under Block 8.3's own 24-trial pool, but collapses to 0.23 under the FULL cumulative research-history trial pool (>=154 trials across Blocks 4/4.5/5/8/8.2/8.3) this verification round's brief required testing — below this project's own 0.5 candidate bar. The decisive finding behind the REJECTED verdict.",
  correlationVsRs3m: 0.02,
  portfolioBenefitNote: "On RS3M's own official 2016-2026 window, a 50/50 RS3M+R3-B blend genuinely improves Sharpe (1.03->1.20) and nearly halves MaxDD (23.7%->12.3%) vs RS3M alone — a real, bug-free diversification benefit (the 65.1% vs 23.99% MaxDD discrepancy flagged going into this round was fully reconciled as a period-length artifact, not a bug). This benefit alone was not enough to overcome the DSR finding.",
  verificationConfidenceNote:
    "Independent reproduction: 0 unexplained discrepancies (66/66 trades match exactly). No look-ahead found (9 adversarial tests). Survives realistic cost up to 20bps/leg. Edge degrades gracefully under concentration removal (not dependent on a few lucky trades). But: entryRsiThreshold and the choice of regime TYPE (trend vs. volatility) are both genuine CLIFFs, not plateaus — combined with the DSR collapse, the edge is not distinguishable from a false discovery once this project's full search history is properly accounted for.",
  sourceDoc: "docs/BLOCK8_4_R3B_INDEPENDENT_VERIFICATION_REPORT.md",
};
