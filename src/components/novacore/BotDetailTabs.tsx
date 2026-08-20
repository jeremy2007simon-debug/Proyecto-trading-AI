"use client";

import { useState, type ReactNode } from "react";

const TABS = ["overview", "performance", "positions", "signal", "risk", "activity"] as const;
export type BotDetailTab = (typeof TABS)[number];

const TAB_LABEL: Record<BotDetailTab, string> = {
  overview: "Overview",
  performance: "Rendimiento",
  positions: "Posiciones",
  signal: "Señal",
  risk: "Riesgo",
  activity: "Actividad",
};

/**
 * §11 — bot detail is separated into tabs/subsections instead of one
 * long scroll. Purely a client-side visibility switch: every tab's
 * content is fetched server-side (in the page component) and passed in
 * already rendered, so switching tabs costs no extra request.
 */
export function BotDetailTabs({ panels }: { panels: Record<BotDetailTab, ReactNode> }) {
  const [tab, setTab] = useState<BotDetailTab>("overview");

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-full border border-border-subtle p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              tab === t ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {panels[tab]}
    </div>
  );
}
