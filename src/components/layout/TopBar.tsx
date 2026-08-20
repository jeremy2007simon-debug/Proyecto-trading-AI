"use client";

import { usePathname } from "next/navigation";
import { Ban, ShieldCheck } from "lucide-react";

/**
 * Observability Upgrade — route-aware. The legacy strip ("Active market /
 * S&P 500 · 15m", "Kill switch") describes the Consensus/Signal Engine
 * pipeline (a single market/timeframe with a Risk Engine kill switch) and
 * would be conceptually wrong for RS3M, which rotates across a universe of
 * four indices and has no "kill switch" concept of its own (it has its own
 * safety guards — see the Execution Safety panel). `/novacore/**` gets its
 * own strip instead of inheriting the legacy one.
 */
export function TopBar() {
  const pathname = usePathname();
  const isNovaCore = pathname?.startsWith("/novacore") ?? false;

  if (isNovaCore) {
    return (
      <header className="flex items-center justify-between border-b border-border bg-surface/60 px-6 py-3 backdrop-blur">
        <div>
          <p className="text-xs text-muted">RS3M Universe</p>
          <p className="text-sm font-medium text-foreground">US Equity Indices · SPY / QQQ / IWM / DIA</p>
        </div>

        <div
          title="No implementation anywhere in this codebase can place a real order — structurally disabled, not just toggled off."
          className="flex items-center gap-2 rounded-full border border-sell/30 bg-sell/10 px-3 py-1.5 text-xs font-medium text-sell"
        >
          <Ban className="size-3.5" strokeWidth={2.5} />
          LIVE structurally disabled
        </div>
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface/60 px-6 py-3 backdrop-blur">
      <div>
        <p className="text-xs text-muted">Active market</p>
        <p className="text-sm font-medium text-foreground">S&amp;P 500 · 15m</p>
      </div>

      <div
        title="Kill switch is inactive — the Risk Engine is not blocking new signals."
        className="flex items-center gap-2 rounded-full border border-buy/30 bg-buy/10 px-3 py-1.5 text-xs font-medium text-buy"
      >
        <ShieldCheck className="size-3.5" strokeWidth={2.5} />
        Kill switch inactive
      </div>
    </header>
  );
}
