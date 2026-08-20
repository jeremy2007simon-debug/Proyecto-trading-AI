"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { isTabActive, NOVACORE_TABS } from "@/lib/novacore-navigation";

/**
 * Desktop equivalent of `BottomTabBar` — same five destinations, same
 * active-route logic, just rendered as a left rail instead of a bottom
 * bar (brief §1: "en desktop puede transformarse/adaptarse a sidebar").
 * Hidden below `md:`.
 */
export function NovaCoreSidebar() {
  const pathname = usePathname() ?? "/novacore";

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Sparkles className="size-4.5" strokeWidth={2.5} />
        </span>
        <p className="text-sm font-semibold text-foreground">NovaCore</p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NOVACORE_TABS.map((tab) => {
          const active = isTabActive(tab, pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-raised hover:text-foreground"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-4" strokeWidth={2} />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border-subtle px-5 py-4 text-[11px] text-muted-foreground">
        Solo lectura · PAPER · LIVE deshabilitado estructuralmente.
      </div>
    </aside>
  );
}
