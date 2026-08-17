/**
 * Block 6 — resolves the Alpaca PAPER TRADING credentials (distinct from
 * `ALPACA_API_KEY_ID`/`ALPACA_API_SECRET_KEY`, the Market Data API
 * credentials `fetch-candidate-assets.ts#resolveAlpacaCredentials`
 * resolves separately). Extracted out of `run-rebalance.ts` so this
 * "missing credentials -> fail closed" behavior has its own direct test
 * (`tests/scripts/block6/paper/credentials.test.ts`) instead of only
 * being exercised indirectly through the full script.
 *
 * Never logs the resolved values — the caller must not either.
 */
export interface AlpacaPaperCredentials {
  keyId: string;
  secretKey: string;
}

export function resolveAlpacaPaperCredentials(env: Partial<NodeJS.ProcessEnv> = process.env): AlpacaPaperCredentials | undefined {
  const keyId = env.ALPACA_PAPER_API_KEY_ID;
  const secretKey = env.ALPACA_PAPER_API_SECRET_KEY;
  if (!keyId || !secretKey) return undefined;
  return { keyId, secretKey };
}
