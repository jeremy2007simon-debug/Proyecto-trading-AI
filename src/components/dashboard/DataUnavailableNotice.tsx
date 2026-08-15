import { AlertTriangle } from "lucide-react";

interface DataUnavailableNoticeProps {
  reason: string;
}

/**
 * Fail-safe UI: rendered whenever the real pipeline could not produce a
 * trustworthy reading (unconfigured provider, fetch failure, or a Data
 * Quality FAIL). Never replaced by mock data — see
 * `docs/ARCHITECTURE.md` §6 and `src/lib/data/market-overview.server.ts`.
 */
export function DataUnavailableNotice({ reason }: DataUnavailableNoticeProps) {
  return (
    <div className="rounded-xl border border-sell/30 bg-sell/5 px-6 py-10 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-sell/15 text-sell">
        <AlertTriangle className="size-5" strokeWidth={2.5} />
      </div>
      <h2 className="mt-3 text-base font-semibold text-foreground">Data unavailable</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{reason}</p>
      <p className="mx-auto mt-4 max-w-md text-xs text-muted-foreground">
        The system never falls back to mock or fabricated data when a real reading can&apos;t
        be trusted — the final signal would be forced to WAIT in the same situation.
      </p>
    </div>
  );
}
