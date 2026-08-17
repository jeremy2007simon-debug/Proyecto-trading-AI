export interface RateLimiter {
  isRateLimited(key: string): boolean;
}

/**
 * Process-local sliding-window rate limiter. Fine for a single-instance
 * deployment; a multi-instance deployment should move this to a shared
 * store (Supabase, Redis, ...) instead.
 */
export function createSlidingWindowRateLimiter(
  windowMs: number,
  maxRequests: number,
): RateLimiter {
  const requestLog = new Map<string, number[]>();

  return {
    isRateLimited(key: string): boolean {
      const now = Date.now();
      const timestamps = (requestLog.get(key) ?? []).filter((t) => now - t < windowMs);
      timestamps.push(now);
      requestLog.set(key, timestamps);
      return timestamps.length > maxRequests;
    },
  };
}
