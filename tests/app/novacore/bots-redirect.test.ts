import { describe, expect, it } from "vitest";
import NovaCoreStrategiesRedirect from "@/app/novacore/strategies/page";
import NovaCoreStrategyDetailRedirect from "@/app/novacore/strategies/[id]/page";

/**
 * §10 — Strategy Hub was renamed to "Bots". The old /novacore/strategies
 * routes must keep working for any bookmarked/old link, by redirecting
 * to the new /novacore/bots equivalent. `next/navigation`'s `redirect()`
 * signals via a thrown error carrying a `NEXT_REDIRECT;...;<url>;...`
 * digest rather than a return value — see node_modules/next/dist/client/components/redirect.js.
 */
function getRedirectTarget(err: unknown): string {
  const digest = (err as { digest?: string }).digest ?? "";
  return digest.split(";")[2] ?? "";
}

describe("/novacore/strategies -> /novacore/bots redirects", () => {
  it("redirects the list page to /novacore/bots", () => {
    try {
      NovaCoreStrategiesRedirect();
      throw new Error("expected redirect() to throw");
    } catch (err) {
      expect(getRedirectTarget(err)).toBe("/novacore/bots");
    }
  });

  it("redirects the detail page to /novacore/bots/:id, preserving the id", async () => {
    try {
      await NovaCoreStrategyDetailRedirect({ params: Promise.resolve({ id: "RS3M_CANDIDATE_V1" }) });
      throw new Error("expected redirect() to throw");
    } catch (err) {
      expect(getRedirectTarget(err)).toBe("/novacore/bots/RS3M_CANDIDATE_V1");
    }
  });
});
