import type { CanonicalCaSignalResult } from "@/core/ca-shadow/canonical-signal";

/**
 * Block 10 §14 — CA Shadow safety guards. Same additive, collect-every-
 * violation pattern as `src/core/paper-trading/rs3m/safety-guards.ts`,
 * scaled down to what a NO-ORDER, shadow-only system actually needs:
 * there is no approval gate, no leverage/short/whitelist check (the
 * shadow engine only ever holds SPY long or flat, structurally — see
 * `shadow-engine.ts`), but every guard that protects DATA INTEGRITY
 * still applies, because a wrong shadow position is still a wrong
 * result even though no money moves. "Si falla: no actualizar posición"
 * (§14) — enforced by the caller (`shadow-engine.ts`) never applying a
 * position transition when `passed` is false.
 */

export interface CaShadowGuardViolation {
  guard: string;
  reason: string;
}

export interface CaShadowGuardResult {
  passed: boolean;
  violations: CaShadowGuardViolation[];
}

export function assertCaCandidateHashNotTampered(candidateId: string, actualHash: string, expectedHash: string): CaShadowGuardViolation | undefined {
  if (actualHash !== expectedHash) {
    return { guard: "CANDIDATE_HASH_MISMATCH", reason: `Candidate "${candidateId}" hashes to "${actualHash}", expected the pinned "${expectedHash}" — the frozen CA_CANDIDATE_V1 definition may have been edited in place. Refusing to update shadow state.` };
  }
  return undefined;
}

export function assertNotDuplicateDate(todayDate: string | undefined, lastProcessedDate: string | undefined): CaShadowGuardViolation | undefined {
  if (todayDate !== undefined && todayDate === lastProcessedDate) {
    return { guard: "DUPLICATE_DATE", reason: `Date ${todayDate} has already been processed (lastProcessedDate matches) — refusing to process it twice (idempotency, §13).` };
  }
  return undefined;
}

export function assertDataFresh(dataCutoffIso: string, nowIso: string, maxStaleDays = 5): CaShadowGuardViolation | undefined {
  const ageMs = new Date(nowIso).getTime() - new Date(dataCutoffIso).getTime();
  if (Number.isNaN(ageMs)) {
    return { guard: "INVALID_TIMESTAMP", reason: `Could not parse dataCutoffIso="${dataCutoffIso}" or nowIso="${nowIso}".` };
  }
  if (ageMs < 0) {
    return { guard: "TIME_MISMATCH", reason: `Data cutoff ${dataCutoffIso} is AFTER "now" (${nowIso}) — refusing (clock or data bug).` };
  }
  const maxAgeMs = maxStaleDays * 24 * 60 * 60 * 1000;
  if (ageMs > maxAgeMs) {
    return { guard: "DATA_STALE", reason: `Data cutoff ${dataCutoffIso} is more than ${maxStaleDays} days old relative to ${nowIso} — refusing to act on stale data.` };
  }
  return undefined;
}

export function assertValidPrice(latestClose: number | undefined): CaShadowGuardViolation | undefined {
  if (latestClose === undefined || !Number.isFinite(latestClose) || latestClose <= 0) {
    return { guard: "INVALID_PRICE", reason: `Latest close is ${latestClose === undefined ? "missing" : latestClose} — not a valid positive price.` };
  }
  return undefined;
}

export function assertSufficientHistory(signal: CanonicalCaSignalResult | undefined): CaShadowGuardViolation | undefined {
  if (!signal || !signal.sufficientHistory) {
    return { guard: "INSUFFICIENT_HISTORY", reason: `Fewer than 252 trailing trading-day returns are available (windowSize=${signal?.windowSize ?? 0}) — cannot compute the canonical percentile threshold.` };
  }
  return undefined;
}

/**
 * §14 — "adjustment mismatch" guard. C-A's verification (Block 9.y) was
 * evaluated against a SPECIFIC adjustment convention (split+dividend
 * adjusted close, see `candidate.ts`/`tests/core/ca-shadow/canonical-
 * signal.test.ts`'s real-SPY-data suite, which converts Yahoo's raw OHLC
 * to `adjClose`-consistent values). If the shadow engine's live data
 * source ever silently switches to unadjusted (or differently-adjusted)
 * closes, the canonical percentile/return math would compute a DIFFERENT
 * statistic than the one C-A was actually verified under — a silent,
 * undetectable correctness bug, not merely a data-quality one. §9: "never
 * silently switch data sources [or, by the same reasoning, conventions]."
 */
export function assertAdjustmentConventionMatches(actualAdjustment: string, expectedAdjustment: string): CaShadowGuardViolation | undefined {
  if (actualAdjustment !== expectedAdjustment) {
    return { guard: "ADJUSTMENT_MISMATCH", reason: `Data source reports adjustment convention "${actualAdjustment}", expected "${expectedAdjustment}" (the convention C-A was verified under) — refusing to compute a signal that would not be comparable to the verified backtest.` };
  }
  return undefined;
}

export interface RunAllCaGuardsParams {
  candidateId: string;
  candidateHash: string;
  expectedCandidateHash: string;
  todayDate: string | undefined;
  lastProcessedDate: string | undefined;
  dataCutoffIso: string;
  nowIso: string;
  maxStaleDays?: number;
  signal: CanonicalCaSignalResult | undefined;
  latestClose: number | undefined;
  dataAdjustment: string;
  expectedAdjustment: string;
}

/** Runs every guard, collects ALL violations (never short-circuits), same "si cualquier safeguard falla: no operar" discipline RS3M's own guards use. */
export function runCaShadowSafetyGuards(params: RunAllCaGuardsParams): CaShadowGuardResult {
  const violations: CaShadowGuardViolation[] = [];

  const hashCheck = assertCaCandidateHashNotTampered(params.candidateId, params.candidateHash, params.expectedCandidateHash);
  if (hashCheck) violations.push(hashCheck);

  const duplicateCheck = assertNotDuplicateDate(params.todayDate, params.lastProcessedDate);
  if (duplicateCheck) violations.push(duplicateCheck);

  const freshnessCheck = assertDataFresh(params.dataCutoffIso, params.nowIso, params.maxStaleDays);
  if (freshnessCheck) violations.push(freshnessCheck);

  const priceCheck = assertValidPrice(params.latestClose);
  if (priceCheck) violations.push(priceCheck);

  const historyCheck = assertSufficientHistory(params.signal);
  if (historyCheck) violations.push(historyCheck);

  const adjustmentCheck = assertAdjustmentConventionMatches(params.dataAdjustment, params.expectedAdjustment);
  if (adjustmentCheck) violations.push(adjustmentCheck);

  return { passed: violations.length === 0, violations };
}
