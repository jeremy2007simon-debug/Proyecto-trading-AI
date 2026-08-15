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

export const KILL_SWITCH_NAV_ICON = AlertTriangle;
