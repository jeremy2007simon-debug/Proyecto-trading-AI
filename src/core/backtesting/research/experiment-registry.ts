import type { ExecutionCostConfig, ExecutionMode } from "@/core/backtesting/types";
import type { StrategyParameters } from "@/core/strategy-manager/types";
import type { Market, Timeframe } from "@/core/shared/types";

/**
 * Block 5 — Experiment Registry (Fase 2). Every experiment must have a
 * reproducible identity: same inputs always produce the same
 * `ExperimentId`, and changing any single input changes it. Deliberately
 * NOT cryptographic (FNV-1a, 32-bit) — this only needs to be a stable,
 * collision-resistant-enough fingerprint for de-duplication and
 * checkpointing within one research run, not a security primitive.
 */

/** Recursively sorts object keys so the same logical spec always serializes identically regardless of property insertion order. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sortedEntries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const result: Record<string, unknown> = {};
    for (const [key, v] of sortedEntries) result[key] = canonicalize(v);
    return result;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** 32-bit FNV-1a over a UTF-8 string, returned as an 8-hex-digit string. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface ExperimentSpecFingerprint {
  strategyId: string;
  strategyVersion: string;
  parameters: StrategyParameters;
  market: Market;
  timeframe: Timeframe;
  datasetFrom: string;
  datasetTo: string;
  costs: ExecutionCostConfig;
  executionMode: ExecutionMode;
  /** Present only for stochastic evaluations (e.g. Monte Carlo) — omit for deterministic backtests. */
  seed?: number;
}

/** `<strategyId>@<version>__<fingerprint>` — the strategy id/version prefix is kept human-readable on purpose; only the variable part (params/dataset/costs/...) needs hashing. */
export function buildExperimentId(spec: ExperimentSpecFingerprint): string {
  const fingerprint = fnv1a(canonicalJson(spec));
  return `${spec.strategyId}@${spec.strategyVersion}__${fingerprint}`;
}

export interface ExperimentRecord extends ExperimentSpecFingerprint {
  id: string;
  createdAt: string;
  /** `git rev-parse HEAD` at the time the experiment ran — obtained by the CALLING script, never by this pure module (no I/O in `src/core`). */
  gitCommit?: string;
  metrics?: unknown;
  classification?: string;
}

export function createExperimentRecord(
  spec: ExperimentSpecFingerprint,
  extra: { createdAt?: string; gitCommit?: string; metrics?: unknown; classification?: string } = {},
): ExperimentRecord {
  return {
    ...spec,
    id: buildExperimentId(spec),
    createdAt: extra.createdAt ?? new Date().toISOString(),
    gitCommit: extra.gitCommit,
    metrics: extra.metrics,
    classification: extra.classification,
  };
}
