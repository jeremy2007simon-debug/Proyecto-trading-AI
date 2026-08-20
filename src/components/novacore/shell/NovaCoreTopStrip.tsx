import { Ban } from "lucide-react";
import { NotificationBell } from "@/components/novacore/shell/NotificationBell";
import type { NovaCoreNotification } from "@/novacore/notifications/types";

/**
 * Persistent top strip across every `/novacore/**` screen — RS3M universe
 * label, the permanent "LIVE structurally disabled" badge (see
 * `docs/BLOCK7_NOVACORE_TRADING_LAB.md` — no implementation anywhere in
 * this codebase can place a real order), and the notification bell.
 * Replaces the old route-aware `TopBar` for NovaCore specifically, now
 * that NovaCore has its own shell (`layout.tsx`) instead of sharing the
 * legacy dashboard's chrome.
 */
export function NovaCoreTopStrip({ notifications }: { notifications: NovaCoreNotification[] }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/80 px-4 py-3 backdrop-blur sm:px-6">
      <div>
        <p className="text-[11px] text-muted">RS3M Universe</p>
        <p className="text-xs font-medium text-foreground sm:text-sm">SPY · QQQ · IWM · DIA</p>
      </div>

      <div className="flex items-center gap-2">
        <div
          title="No implementation anywhere in this codebase can place a real order — structurally disabled, not just toggled off."
          className="hidden items-center gap-1.5 rounded-full border border-sell/30 bg-sell/10 px-2.5 py-1 text-[11px] font-medium text-sell sm:flex"
        >
          <Ban className="size-3" strokeWidth={2.5} />
          LIVE deshabilitado
        </div>
        <NotificationBell notifications={notifications} />
      </div>
    </header>
  );
}
