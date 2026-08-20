import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Bot,
  Boxes,
  FlaskConical,
  Gauge,
  History,
  LayoutDashboard,
  LineChart,
  ListChecks,
  PieChart,
  Radar,
  ScrollText,
  Settings,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Single source of truth for sidebar navigation. Both `Sidebar` and any
 * future breadcrumb/command-palette component should read from this
 * list rather than hardcoding routes.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Market", href: "/market", icon: LineChart },
  { label: "Market Regime", href: "/market-regime", icon: Radar },
  { label: "Strategies", href: "/strategies", icon: ListChecks },
  { label: "Signals", href: "/signals", icon: Activity },
  { label: "Backtesting", href: "/backtesting", icon: BarChart3 },
  { label: "Paper Trading", href: "/paper-trading", icon: Gauge },
  { label: "Analytics", href: "/analytics", icon: Bot },
  { label: "Risk Management", href: "/risk-management", icon: ShieldAlert },
  { label: "System Logs", href: "/system-logs", icon: ScrollText },
  { label: "Settings", href: "/settings", icon: Settings },
];

/**
 * Block 7 — NovaCore Trading Lab control-plane navigation. Deliberately a
 * SEPARATE list from `NAV_ITEMS` (rendered as its own sidebar section by
 * `Sidebar`): these routes read `src/novacore/**`, a distinct control
 * plane from the legacy Consensus/Signal Strategy Manager pages above,
 * and must never be confused with them (see
 * `docs/BLOCK7_NOVACORE_TRADING_LAB.md` "Source of truth").
 */
export const NOVACORE_NAV_ITEMS: NavItem[] = [
  { label: "NovaCore", href: "/novacore", icon: Sparkles },
  { label: "Estrategias", href: "/novacore/strategies", icon: Boxes },
  { label: "Investigación", href: "/novacore/research", icon: FlaskConical },
  { label: "Ejecución", href: "/novacore/execution", icon: ArrowRightLeft },
  { label: "Riesgo y Analítica", href: "/novacore/risk", icon: PieChart },
  { label: "Actividad", href: "/novacore/activity", icon: History },
];

export const KILL_SWITCH_NAV_ICON = AlertTriangle;
