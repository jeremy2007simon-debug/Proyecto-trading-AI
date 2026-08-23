import { C_A_FROZEN_SPEC, computeCandidateSpecHash, type FrozenCandidateSpec } from "@/core/strategy2-verification/candidate-specs";

/**
 * Block 10 §2 — CA_CANDIDATE_V1, the canonical, frozen definition of
 * NovaCore's Strategy #2 shadow candidate.
 *
 * Deliberately the SAME object Block 9.y already froze and hashed
 * (`C_A_FROZEN_SPEC`, hash `f6b860f5`) — re-exported, not redefined, per
 * this block's own §21 instruction ("no duplicar manualmente datos si
 * pueden leerse"). Its status here is `"VERIFIED"` (Block 9.y's
 * decision); it is NOT `"PAPER_READY"`, `"PAPER"`, or `"LIVE"` — see
 * `src/novacore/shared/types.ts`'s `NovaCoreStrategyStatus` for the
 * SHADOW-specific states this candidate actually uses.
 *
 * The canonical percentile-interpolation method (linear interpolation,
 * resolving Block 9.y's 4/8194 reproduction ambiguity) is pinned
 * separately in `canonical-signal.ts` — see that file's doc comment for
 * why it is NOT folded into this hash.
 */
export const CA_CANDIDATE_V1: FrozenCandidateSpec = C_A_FROZEN_SPEC;

export function computeCaCandidateHash(candidate: FrozenCandidateSpec = CA_CANDIDATE_V1): string {
  return computeCandidateSpecHash(candidate);
}

/**
 * Same tripwire pattern as `src/core/paper-trading/rs3m/safety-guards.ts`'s
 * `EXPECTED_RS3M_CANDIDATE_V1_HASH`: a SEPARATELY-DECLARED literal, never
 * imported from `candidate-specs.ts` or `candidate.ts` itself, so an
 * in-place edit of `C_A_FROZEN_SPEC` cannot silently pass by both the
 * definition and the check reading the same (edited) value.
 */
export const EXPECTED_CA_CANDIDATE_V1_HASH = "f6b860f5";
