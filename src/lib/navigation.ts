import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Gauge,
  LayoutDashboard,
  LineChart,
  ListChecks,
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
 * Block 7 — NovaCore Trading Lab entry point. NovaCore now has its own
 * app shell and internal navigation (bottom tab bar on mobile, its own
 * sidebar on desktop — see `src/app/novacore/layout.tsx` and
 * `src/lib/novacore-navigation.ts`), so the legacy dashboard's sidebar
 * only needs a single cross-link into it, not a mirror of its internal
 * routes (see `docs/BLOCK7_NOVACORE_TRADING_LAB.md` "Source of truth").
 */
export const NOVACORE_NAV_ITEMS: NavItem[] = [{ label: "NovaCore", href: "/novacore", icon: Sparkles }];

export const KILL_SWITCH_NAV_ICON = AlertTriangle;
