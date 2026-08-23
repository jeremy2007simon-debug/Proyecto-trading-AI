import type { LucideIcon } from "lucide-react";
import { ArrowRightLeft, Database, FlaskConical, GitCompareArrows, History, Home, Info, LineChart, MoreHorizontal, PieChart, Radar, Settings, ShieldCheck } from "lucide-react";

/**
 * Observability Upgrade — NovaCore's own bottom-tab-bar navigation.
 * Deliberately separate from `src/lib/navigation.ts` (the legacy
 * Sidebar's `NAV_ITEMS`/`NOVACORE_NAV_ITEMS`): NovaCore now has its own
 * app shell (`src/app/novacore/layout.tsx`) and does not reuse the
 * legacy dashboard's chrome at all. Five tabs only, matching the brief's
 * "few things per screen" mandate — everything else lives under "More".
 */
export interface NovaCoreTab {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Route prefixes that should highlight this tab as active, beyond `href` itself. */
  matchPrefixes: string[];
}

export const NOVACORE_TABS: NovaCoreTab[] = [
  { label: "Inicio", href: "/novacore", icon: Home, matchPrefixes: [] },
  { label: "Mercado", href: "/novacore/market", icon: LineChart, matchPrefixes: ["/novacore/market"] },
  { label: "Bots", href: "/novacore/bots", icon: Radar, matchPrefixes: ["/novacore/bots", "/novacore/strategies"] },
  { label: "Investigación", href: "/novacore/research", icon: FlaskConical, matchPrefixes: ["/novacore/research"] },
  {
    label: "Más",
    href: "/novacore/more",
    icon: MoreHorizontal,
    matchPrefixes: ["/novacore/more", "/novacore/activity", "/novacore/execution", "/novacore/risk", "/novacore/system", "/novacore/data-sources", "/novacore/settings", "/novacore/about", "/novacore/portfolio-lab"],
  },
];

export function isTabActive(tab: NovaCoreTab, pathname: string): boolean {
  if (pathname === tab.href) return true;
  return tab.matchPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export interface MoreMenuLink {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

/** §13 — secondary pages, reachable from the "More" tab instead of crowding the main bottom nav. */
export const MORE_MENU_LINKS: MoreMenuLink[] = [
  { label: "Actividad", description: "Línea de tiempo unificada de todos los eventos.", href: "/novacore/activity", icon: History },
  { label: "Portfolio Lab", description: "RS3M (Paper) vs. C-A (Shadow) — comparación, nunca capital combinado.", href: "/novacore/portfolio-lab", icon: GitCompareArrows },
  { label: "Ejecución", description: "Broker, cuenta, órdenes, aprobaciones, guards.", href: "/novacore/execution", icon: ArrowRightLeft },
  { label: "Riesgo y Analítica", href: "/novacore/risk", description: "Métricas de riesgo histórico, OOS y forward.", icon: PieChart },
  { label: "Salud del sistema", description: "Cada check, con su propia explicación.", href: "/novacore/system", icon: ShieldCheck },
  { label: "Fuentes de datos", description: "De dónde viene cada dato mostrado en NovaCore.", href: "/novacore/data-sources", icon: Database },
  { label: "Ajustes", description: "No hay controles editables — solo lectura.", href: "/novacore/settings", icon: Settings },
  { label: "Acerca de NovaCore", description: "Qué es, qué no es, y por qué.", href: "/novacore/about", icon: Info },
];
