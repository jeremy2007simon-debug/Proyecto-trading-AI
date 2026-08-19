/**
 * Block 7, section 7 — `ResearchProject`. Groups the hypotheses/experiments
 * tested under one research program so the Research Lab can show rollups
 * like "Hypotheses: 24, Rejected: 22, Research: 1, Candidates: 1" instead
 * of a flat experiment list. This is a NovaCore-level grouping on top of
 * the existing Block 4/4.5/5 reports and experiment registry — it does
 * not replace `src/core/backtesting/research/experiment-registry.ts` or
 * any report, only summarizes them.
 */
export interface ResearchProject {
  id: string;
  name: string;
  objective: string;
  createdAt: string;
  status: "ACTIVE" | "COMPLETE";

  hypothesesTotal: number;
  rejected: number;
  research: number;
  candidates: number;

  constraints: string[];
  benchmarks: string[];

  /** Free-text pointers into the frozen reports these counts were transcribed from — never recomputed. */
  notes: string;
  sourceDoc: string;
}
