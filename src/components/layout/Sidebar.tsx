import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { NAV_ITEMS } from "@/lib/navigation";

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <TrendingUp className="size-4.5" strokeWidth={2.5} />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-foreground">
            Trading Analysis
          </p>
          <p className="text-[11px] text-muted">S&amp;P 500 · Paper only</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <Icon className="size-4" strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border-subtle px-5 py-4 text-[11px] text-muted-foreground">
        No real broker connected. Analysis &amp; paper trading only.
      </div>
    </aside>
  );
}
