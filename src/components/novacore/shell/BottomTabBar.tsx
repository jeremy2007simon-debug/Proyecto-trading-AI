"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isTabActive, NOVACORE_TABS } from "@/lib/novacore-navigation";

/**
 * Persistent bottom tab bar — the primary navigation surface on mobile,
 * conceptually modeled on modern iPhone apps (few top-level destinations,
 * always visible, thumb-reachable). Hidden at `md:` and up, where
 * `NovaCoreSidebar` takes over. Safe-area aware so it never sits under
 * the iPhone home indicator.
 */
export function BottomTabBar() {
  const pathname = usePathname() ?? "/novacore";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegación principal de NovaCore"
    >
      <div className="mx-auto flex max-w-xl items-stretch justify-around">
        {NOVACORE_TABS.map((tab) => {
          const active = isTabActive(tab, pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex min-w-[64px] flex-1 flex-col items-center justify-center gap-1 px-2 py-2.5 text-[11px] font-medium transition-colors"
              aria-current={active ? "page" : undefined}
            >
              <Icon className={`size-5 ${active ? "text-accent" : "text-muted"}`} strokeWidth={active ? 2.5 : 2} />
              <span className={active ? "text-accent" : "text-muted"}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
