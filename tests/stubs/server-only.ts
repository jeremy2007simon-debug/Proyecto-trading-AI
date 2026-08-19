/**
 * Test-only stub for the `server-only` package. In a real Next.js build,
 * `server-only` throws if a file importing it ends up in a CLIENT bundle
 * — a build-time guard enforced by webpack/Turbopack, not something that
 * makes sense to also enforce inside vitest's plain Node/jsdom test
 * runner (nothing here ever produces a client bundle). Aliased in
 * `vitest.config.mts` so server-only-guarded modules (NovaCore adapters,
 * `src/lib/data/*.server.ts`, API routes) can be imported directly in
 * tests without every test needing to know about this package.
 */
export {};
