import { CircleOff, PlugZap, TimerReset } from "lucide-react";

/**
 * §18 — "No quiero '0' engañosos cuando realmente no tenemos datos."
 * Three distinct empty states that must never be visually interchangeable:
 *
 * - `zero`: a real, confirmed value of zero (e.g. "0 paper orders" after
 *   a live/ledger read genuinely returned nothing).
 * - `noData`: the source exists and is reachable, but has not produced a
 *   result yet (e.g. "0 forward months" — the ledger is real, forward
 *   trading just hasn't completed a period yet).
 * - `notConnected`: the underlying source is not configured/reachable at
 *   all in this environment (e.g. no Alpaca credentials) — this is never
 *   the same claim as "zero".
 */
export type EmptyStateVariant = "zero" | "noData" | "notConnected";

const VARIANT_ICON = { zero: CircleOff, noData: TimerReset, notConnected: PlugZap } as const;
const VARIANT_STYLE = {
  zero: "text-muted-foreground",
  noData: "text-wait",
  notConnected: "text-muted",
} as const;

export function EmptyState({ variant, message, detail }: { variant: EmptyStateVariant; message: string; detail?: string }) {
  const Icon = VARIANT_ICON[variant];
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
      <Icon className={`size-5 ${VARIANT_STYLE[variant]}`} strokeWidth={1.75} />
      <p className={`text-sm ${VARIANT_STYLE[variant]}`}>{message}</p>
      {detail ? <p className="max-w-sm text-[11px] text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
