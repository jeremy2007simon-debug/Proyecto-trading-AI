import type { ReactNode } from "react";
import { BottomTabBar } from "@/components/novacore/shell/BottomTabBar";
import { NovaCoreSidebar } from "@/components/novacore/shell/NovaCoreSidebar";
import { NovaCoreTopStrip } from "@/components/novacore/shell/NovaCoreTopStrip";
import { buildNovaCoreNotifications } from "@/novacore/notifications/build-notifications";

/**
 * Observability Upgrade — NovaCore's own app shell, deliberately separate
 * from `src/components/layout/AppShell.tsx` (the legacy Consensus/Signal
 * dashboard's sidebar+topbar chrome). Mobile-first: a persistent bottom
 * tab bar is the primary navigation surface, matching a modern iPhone
 * app's structure (few top-level destinations, thumb-reachable,
 * always-visible) rather than an admin dashboard's sidebar-first layout.
 * The same five destinations reappear as a left rail at `md:` and up.
 */
export default async function NovaCoreLayout({ children }: { children: ReactNode }) {
  const notifications = await buildNovaCoreNotifications({ limit: 20 });

  return (
    <div className="flex min-h-screen w-full">
      <NovaCoreSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <NovaCoreTopStrip notifications={notifications} />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-6">
          <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">{children}</div>
        </main>
        <BottomTabBar />
      </div>
    </div>
  );
}
