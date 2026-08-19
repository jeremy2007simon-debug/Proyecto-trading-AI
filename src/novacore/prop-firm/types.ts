/**
 * Block 7, section 15 — architecture preparation ONLY for a future Prop
 * Firm Research Lab (Block 8's proposed scope). `TradingProgramConstraintSet`
 * is a GENERIC shape: no FTMO-specific values are hardcoded anywhere in
 * `src/core` or `src/novacore` — any concrete program's numbers belong in
 * data, supplied when Block 8 actually builds that research lab, never in
 * this type. Nothing in this block implements a prop-firm strategy,
 * connects to a prop-firm broker, or purchases/represents an evaluation
 * challenge.
 */
export interface TradingProgramConstraintSet {
  programId: string;
  programName: string;

  profitTargetPct?: number;
  dailyLossLimitPct?: number;
  maximumLossPct?: number;
  minimumTradingDays?: number;

  allowedInstruments: string[];
  overnightAllowed: boolean;
  weekendAllowed: boolean;
  newsRestrictions?: string;
  automationRules?: string;

  /** Where these figures were sourced from — required so a program's rules are always re-verifiable, never assumed (section 15's explicit instruction). */
  sourceOfTruth: string;
}
