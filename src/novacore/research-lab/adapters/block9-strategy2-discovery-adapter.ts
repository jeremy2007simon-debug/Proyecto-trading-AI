import type { CumulativeTrialLedgerSummary, Strategy2BacktestFamilyOutcome, Strategy2CandidateSummary, Strategy2DiscoveryFamily, Strategy2VerificationOutcome } from "@/novacore/research-lab/types";

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

/**
 * Superseded by Block 9.x's own execution: Phase A (literature review,
 * this file's `STRATEGY2_TOP5_FAMILIES`) ran 0 backtests; Phase B
 * (`STRATEGY2_BACKTEST_OUTCOMES`/`STRATEGY2_CANDIDATES` below) executed
 * 18 of the 20 pre-registered configurations (2 marked
 * DATA_INSUFFICIENT before any code ran for them), of which 17 produced
 * a usable Sharpe ratio and therefore count as this round's own trial
 * pool. `priorCumulativeFloor` now reflects the TOTAL floor after both
 * phases — never reduced to flatter a future DSR.
 */
export const CUMULATIVE_TRIAL_LEDGER_SUMMARY: CumulativeTrialLedgerSummary = {
  priorCumulativeFloor: "≥171",
  newTrialsThisBlock: 17,
  reconciledArithmetic: "154 (Blocks 4-8.4) + 17 (Block 9.x's own executed configs, 18 run minus 1 degenerate-Sharpe case) = 171",
  policy: "Never reduced to flatter a future DSR. Any future deep-backtest round adds its own configurations on top of this ≥171 floor, never resets it.",
  sourceDoc: "results/block9b/funnel-outcomes.json (raw, regenerate via scripts/research/strategy2/run-block9b-funnel.ts), transcribed into docs/BLOCK9B_STRATEGY2_DEEP_BACKTEST_REPORT.md §1",
};

/** Block 9.x §3-4 — per-family deep-backtest verdicts, in the same D/E/M/F/C order as the discovery report's Top-5. */
export const STRATEGY2_BACKTEST_OUTCOMES: Strategy2BacktestFamilyOutcome[] = [
  {
    letter: "D",
    name: "Overnight / Intraday Return Decomposition",
    configsExecuted: 4,
    configsDataInsufficient: 0,
    candidateConfigIds: [],
    verdict: "NO_CANDIDATE",
    summary: "D-C (combined overnight-long + intraday-short) REJECTED outright: gross +799% but net -97.6% — daily round-trip costs on both legs are ruinous compounded over 8,447 days. D-A/B/D (single-leg, overnight-only) survive to net-positive but none clears the 0.5 cumulative-pool DSR bar (0.000-0.065); D-B/D-D additionally correlate >=0.50 with RS3M.",
    sourceDoc: "docs/BLOCK9B_STRATEGY2_DEEP_BACKTEST_REPORT.md §3",
  },
  {
    letter: "E",
    name: "Volatility Risk Premium",
    configsExecuted: 2,
    configsDataInsufficient: 2,
    candidateConfigIds: ["E-C"],
    verdict: "CANDIDATE_FOUND",
    summary: "E-C (long SVXY, hard -15% stop, VIX-percentile-gated entry) is a CANDIDATE — DSR 0.995, the round's highest. E-A (same structure, unconditional entry) is downgraded to RESEARCH specifically for an unacceptable Monte Carlo tail (P95 MaxDD 99.7%) despite a respectable own-pool DSR — the entry filter is what separates a fundable candidate from an unacceptable tail. E-B/E-D (options spreads) are DATA_INSUFFICIENT — no historical SPY options-chain source available.",
    sourceDoc: "docs/BLOCK9B_STRATEGY2_DEEP_BACKTEST_REPORT.md §3",
  },
  {
    letter: "M",
    name: "Turn-of-Month / Calendar Seasonality",
    configsExecuted: 4,
    configsDataInsufficient: 0,
    candidateConfigIds: [],
    verdict: "NO_CANDIDATE",
    summary: "All 4 configs net-positive and OOS-positive; the pre-registered decay check found NO decay (every config's most-recent-decade return is positive). M-A (SPY) and M-D (DIA) miss the 0.5 DSR bar narrowly (0.496, 0.495) — the closest near-misses of the round.",
    sourceDoc: "docs/BLOCK9B_STRATEGY2_DEEP_BACKTEST_REPORT.md §3",
  },
  {
    letter: "F",
    name: "Defensive / Low-Volatility Equity",
    configsExecuted: 4,
    configsDataInsufficient: 0,
    candidateConfigIds: [],
    verdict: "NO_CANDIDATE",
    summary: "Statistically the STRONGEST family of the round (DSR up to 1.000, F-C/USMV) but every config correlates 0.60-0.87 with RS3M — the same non-diversification finding Block 8.3's own Family 1 already produced, now independently reproduced a second time.",
    sourceDoc: "docs/BLOCK9B_STRATEGY2_DEEP_BACKTEST_REPORT.md §3",
  },
  {
    letter: "C",
    name: "Short-Term Reversal (large-liquid-ETF-only)",
    configsExecuted: 4,
    configsDataInsufficient: 0,
    candidateConfigIds: ["C-A"],
    verdict: "CANDIDATE_FOUND",
    summary: "C-A (SPY, bottom-decile trailing-252d trigger) is a CANDIDATE — the round's best diversifier (correlation 0.077, lowest of all 20 configs), DSR 0.695, PLATEAU parameter sensitivity. C-B (QQQ, same design) shows similarly excellent diversification but fails DSR decisively. C-C/C-D (cross-sectional variants) correlate too highly with RS3M (0.79-0.81) to diversify it.",
    sourceDoc: "docs/BLOCK9B_STRATEGY2_DEEP_BACKTEST_REPORT.md §3",
  },
];

/** Block 9.x §5 — the 2 surviving CANDIDATEs' key figures + portfolio contribution alongside RS3M. Independent verification NOT started for either, per this block's explicit instruction. */
export const STRATEGY2_CANDIDATES: Strategy2CandidateSummary[] = [
  {
    configId: "E-C",
    family: "E — Volatility Risk Premium",
    description: "Long SVXY, fixed notional, hard -15% stop, entry gated on trailing-1yr VIX percentile <= median",
    netTotalReturnPct: 449.7,
    annualizedSharpe: 0.534,
    maxDrawdownPct: 52.94,
    dsrCumulativePool: 0.265,
    correlationVsRs3m: 0.275,
    portfolioBlendSharpe: 0.903,
    portfolioBlendMaxDrawdownPct: 26.4,
    independentVerificationStatus: "REJECTED",
    sourceDoc: "docs/BLOCK9Y_INDEPENDENT_VERIFICATION_REPORT.md",
  },
  {
    configId: "C-A",
    family: "C — Short-Term Reversal",
    description: "SPY time-series reversal: long 1 day after a bottom-decile trailing-252d daily return",
    netTotalReturnPct: 253.3,
    annualizedSharpe: 0.613,
    maxDrawdownPct: 17.3,
    dsrCumulativePool: 0.695,
    correlationVsRs3m: 0.077,
    portfolioBlendSharpe: 0.878,
    portfolioBlendMaxDrawdownPct: 44.19,
    independentVerificationStatus: "VERIFIED",
    sourceDoc: "docs/BLOCK9Y_INDEPENDENT_VERIFICATION_REPORT.md",
  },
];

/**
 * Block 9.y — independent verification outcomes. Note: E-C's figures
 * above (`STRATEGY2_CANDIDATES`) were UPDATED from Block 9.x's original
 * report to the spec-compliant (independent) implementation's numbers —
 * Block 9.x's original DSR-0.995/net-+1215.9% figures for E-C were
 * produced by a confirmed implementation bug (see `reproductionVerdict`
 * below) and are NOT carried forward as this candidate's current
 * standing.
 */
export const STRATEGY2_VERIFICATION_OUTCOMES: Strategy2VerificationOutcome[] = [
  {
    configId: "C-A",
    status: "VERIFIED",
    specHash: "f6b860f5",
    reproductionVerdict: "PASS (explained, immaterial): 4/8194 trigger-day mismatches and a ~2pp total-return gap vs. the independent reimplementation, fully explained by a deliberately different (but equally standard) percentile-interpolation method.",
    keyFailurePoints: [],
    portfolioContribution: "Official window (2016-01..2026-08, 128mo): RS3M alone Sharpe 1.028/MaxDD 23.67% -> 50/50 blend Sharpe 1.039/MaxDD 20.16% (both improve). Extended window (1994-01..2026-08, 392mo): RS3M alone Sharpe 0.736/MaxDD 65.11% -> blend Sharpe 0.878/MaxDD 44.19% (both improve). Confirmed on identical windows in both cases.",
    sourceDoc: "docs/BLOCK9Y_INDEPENDENT_VERIFICATION_REPORT.md",
  },
  {
    configId: "E-C",
    status: "REJECTED",
    specHash: "6b8da4c9",
    reproductionVerdict:
      "FAIL: the original Block 9.x implementation's VIX-percentile lookback used ~252 CALENDAR days (confirmed = 180 actual trading-day observations) instead of the spec-intended 252 TRADING days. 369/3741 (9.9%) day-level position mismatches vs. the spec-compliant independent implementation; net total return 1215.9% (original, buggy) vs. 449.7% (independent, spec-compliant) — a confirmed, material, decisive discrepancy, not a rounding difference.",
    keyFailurePoints: [
      "Reproduction failure alone is decisive per this block's own rule.",
      "DSR under the >=171 cumulative pool (spec-compliant series): 0.265, well below the 0.5 bar.",
      "Walk-forward positive-window rate (spec-compliant series): 46.7%, below the 50% majority bar.",
      "Only 3 total position entries across ~15 years of SVXY history (spec-compliant filter) — ALL 3 ended in a stop-loss (100% stop rate), a strong overfitting/mistimed-entry signal from a very thin sample.",
      "Gap-aware worst real drawdown 55.2% (block-bootstrap MC P95/P99 64.0%/72.9%, spec-compliant series) — an unacceptable tail for a candidate this project would run in Paper.",
    ],
    portfolioContribution: "Official window (2016-01..2026-08, 128mo): RS3M alone Sharpe 1.028/MaxDD 23.67% -> 50/50 blend Sharpe 0.970 (LOWER)/MaxDD 21.46% (slightly improved). Extended window (2011-10..2026-08, 179mo): RS3M alone Sharpe 1.097/MaxDD 23.67% -> blend Sharpe 0.903 (LOWER)/MaxDD 26.40% (WORSE). The spec-compliant candidate's portfolio case is materially weaker than Block 9.x originally reported.",
    sourceDoc: "docs/BLOCK9Y_INDEPENDENT_VERIFICATION_REPORT.md",
  },
];

export function getStrategy2FamilyByRank(rank: number): Strategy2DiscoveryFamily | undefined {
  return STRATEGY2_TOP5_FAMILIES.find((f) => f.rank === rank);
}
