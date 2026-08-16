/**
 * Shared boilerplate for standalone research scripts in this repo
 * (`scripts/run-backtest-experiment.ts` and everything added in Block
 * 4.5). None of this is production code — it exists only because this
 * particular development sandbox needs two workarounds that a normal
 * Next.js runtime (or a different machine) would not:
 *
 *   1. `.env.local` isn't loaded automatically outside Next.js.
 *   2. Node's built-in `fetch` doesn't route through this sandbox's
 *      forward proxy ($HTTPS_PROXY), while `curl` does — see the
 *      `curlFetch` docstring below for the full story.
 *
 * Call `setupSandboxIO()` once, at the very top of a script, before any
 * other import that might fetch.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

function loadDotEnvLocal(): void {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const execFileAsync = promisify(execFile);

/**
 * This development sandbox routes outbound HTTPS through a local
 * forward proxy ($HTTPS_PROXY); `curl` honors that env var natively,
 * but Node's built-in `fetch` (undici) does not, and neither
 * `undici.setGlobalDispatcher` nor an explicit `dispatcher: new
 * ProxyAgent(...)` reached the built-in fetch in this Node build during
 * testing (Block 4). Rather than change any real adapter's plain
 * `fetch()` calls (production deployments do not sit behind this proxy
 * and need no such shim), every research script replaces
 * `globalThis.fetch` with this `curl`-backed implementation for the
 * lifetime of the process only. Every caller in this codebase only ever
 * reads `response.status` and calls `response.json()` on a fetch result
 * — never headers — so a status+body-only `Response` is a complete,
 * honest substitute here.
 */
async function curlFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const headerArgs = Object.entries(headers).flatMap(([key, value]) => ["-H", `${key}: ${value}`]);

  const dir = mkdtempSync(join(tmpdir(), "curl-fetch-"));
  const bodyFile = join(dir, "body");
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-sS", "-o", bodyFile, "-w", "%{http_code}", url, ...headerArgs],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    const status = Number(stdout.trim());
    const body = readFileSync(bodyFile, "utf8");
    return new Response(body, { status: Number.isFinite(status) && status > 0 ? status : 599 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Call once at the top of a standalone research script. */
export function setupSandboxIO(): void {
  loadDotEnvLocal();
  globalThis.fetch = curlFetch as typeof fetch;
}
