"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import type { NovaCoreNotification } from "@/novacore/notifications/types";

const PRIORITY_DOT: Record<NovaCoreNotification["priority"], string> = {
  CRITICAL: "bg-sell",
  IMPORTANT: "bg-wait",
  INFO: "bg-accent",
};

const CATEGORY_LABEL: Record<NovaCoreNotification["category"], string> = {
  SIGNAL: "Señal",
  APPROVAL: "Aprobación",
  ORDER: "Orden",
  SYSTEM: "Sistema",
  RISK: "Riesgo",
  RESEARCH: "Investigación",
};

/**
 * §14 — Notification Center entry point. Purely a read-only viewer over
 * `notifications` (already computed server-side in `layout.tsx` from real
 * activity/health/guard state) — no execution controls live here, no
 * client-side polling/fetch loop added for this phase.
 */
export function NotificationBell({ notifications }: { notifications: NovaCoreNotification[] }) {
  const [open, setOpen] = useState(false);
  const attentionCount = notifications.filter((n) => n.priority !== "INFO").length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificaciones"
        aria-expanded={open}
        className="relative flex size-9 items-center justify-center rounded-full border border-border-subtle bg-surface-raised text-muted transition-colors hover:text-foreground"
      >
        <Bell className="size-4" strokeWidth={2} />
        {attentionCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-sell text-[9px] font-semibold text-sell-foreground">
            {attentionCount > 9 ? "9+" : attentionCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button type="button" aria-label="Cerrar notificaciones" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 max-h-[70vh] w-80 max-w-[85vw] overflow-y-auto rounded-xl border border-border bg-surface shadow-lg shadow-black/40">
            <div className="border-b border-border-subtle px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Notificaciones</p>
              <p className="text-[11px] text-muted">Derivadas de eventos, salud y guards reales — nunca inventadas.</p>
            </div>
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Nada que requiera tu atención.</p>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li key={n.id} className="border-b border-border-subtle last:border-0">
                    <Link href={n.href ?? "/novacore"} onClick={() => setOpen(false)} className="flex gap-2.5 px-4 py-3 hover:bg-surface-raised">
                      <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${PRIORITY_DOT[n.priority]}`} />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{CATEGORY_LABEL[n.category]}</p>
                        <p className="text-sm text-foreground">{n.message}</p>
                        {n.detail ? <p className="mt-0.5 text-xs text-muted">{n.detail}</p> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
