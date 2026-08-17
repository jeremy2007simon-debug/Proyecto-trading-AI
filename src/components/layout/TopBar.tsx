import { ShieldCheck } from "lucide-react";

export function TopBar() {
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
