/**
 * Block 10 §8 — the exact instant Block 10 (C-A shadow forward
 * validation) is frozen. Forward evidence begins STRICTLY AFTER this
 * instant — "no retroactive backfill of recent months disguised as
 * forward evidence." Declared as a fixed literal (not `Date.now()` at
 * import time, which would silently drift to "whenever this process
 * first happened to run") so every future invocation of the shadow
 * routine agrees on exactly the same cutoff.
 */
export const CA_FORWARD_START_TIMESTAMP = "2026-08-23T00:00:00.000Z";

/** True if `dateOrIso` (a shadow day's date, or any ISO instant) falls ON OR BEFORE the frozen forward-start instant — i.e. it would be backfill, not genuine forward evidence. */
export function isBeforeCaForwardStart(dateOrIso: string): boolean {
  return new Date(dateOrIso).getTime() < new Date(CA_FORWARD_START_TIMESTAMP).getTime();
}
