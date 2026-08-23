"use client";

import { useState, type ReactNode } from "react";

const DEFAULT_TABS = ["overview", "performance", "positions", "signal", "risk", "activity"] as const;
export type BotDetailTab = (typeof DEFAULT_TABS)[number];

const DEFAULT_TAB_LABEL: Record<BotDetailTab, string> = {
  overview: "Overview",
  performance: "Rendimiento",
  positions: "Posiciones",
  signal: "Señal",
  risk: "Riesgo",
  activity: "Actividad",
};

export interface BotDetailTabDef {
  id: string;
  label: string;
}

/**
 * §11 — bot detail is separated into tabs/subsections instead of one
 * long scroll. Purely a client-side visibility switch: every tab's
 * content is fetched server-side (in the page component) and passed in
 * already rendered, so switching tabs costs no extra request.
 *
 * Block 10 §5/§28 — `tabs` is optional and additive: RS3M's page keeps
 * calling this with only `panels` (defaulting to the original 6-tab set
 * above), and C-A's page passes its own `tabs` list (`overview,
 * performance, signal, shadow, risk, activity` — "shadow" replaces
 * "positions", since C-A never has a broker position). This is
 * deliberately the SAME component reused for both — not a second,
 * parallel tab UI (§28: "No construir una segunda UI paralela").
 */
export function BotDetailTabs({ panels, tabs }: { panels: Record<string, ReactNode>; tabs?: BotDetailTabDef[] }) {
  const resolvedTabs: BotDetailTabDef[] = tabs ?? DEFAULT_TABS.map((id) => ({ id, label: DEFAULT_TAB_LABEL[id] }));
  const [tab, setTab] = useState<string>(resolvedTabs[0]?.id ?? "overview");

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-full border border-border-subtle p-1">
        {resolvedTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {panels[tab]}
    </div>
  );
}
