import type { HealthStatus, NovaCoreStrategyStatus } from "@/novacore/shared/types";

const STRATEGY_STATUS_STYLE: Record<NovaCoreStrategyStatus, string> = {
  RESEARCH: "border-accent/30 bg-accent/10 text-accent",
  REJECTED: "border-sell/30 bg-sell/10 text-sell",
  CANDIDATE: "border-accent/30 bg-accent/10 text-accent",
  PAPER_READY: "border-wait/30 bg-wait/10 text-wait",
  PAPER_RUNNING: "border-accent/30 bg-accent/10 text-accent",
  SHADOW_READY: "border-purple-400/30 bg-purple-400/10 text-purple-400",
  SHADOW_RUNNING: "border-purple-400/30 bg-purple-400/10 text-purple-400",
  FORWARD_VERIFIED: "border-buy/30 bg-buy/10 text-buy",
  LIVE_ELIGIBLE: "border-buy/30 bg-buy/10 text-buy",
  LIVE: "border-buy/30 bg-buy/10 text-buy",
};

export function StrategyStatusBadge({ status }: { status: NovaCoreStrategyStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${STRATEGY_STATUS_STYLE[status]}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

const HEALTH_STYLE: Record<HealthStatus, string> = {
  HEALTHY: "border-buy/30 bg-buy/10 text-buy",
  WARNING: "border-wait/30 bg-wait/10 text-wait",
  DEGRADED: "border-wait/30 bg-wait/10 text-wait",
  ERROR: "border-sell/30 bg-sell/10 text-sell",
  OFFLINE: "border-border bg-surface-raised text-muted",
};

export function HealthBadge({ status }: { status: HealthStatus }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${HEALTH_STYLE[status]}`}>{status}</span>;
}

export type MetricScope = "BACKTEST" | "OOS" | "FORWARD_PAPER" | "LIVE_DISABLED";

const SCOPE_STYLE: Record<MetricScope, string> = {
  BACKTEST: "border-accent/30 bg-accent/10 text-accent",
  OOS: "border-wait/30 bg-wait/10 text-wait",
  FORWARD_PAPER: "border-buy/30 bg-buy/10 text-buy",
  LIVE_DISABLED: "border-sell/30 bg-sell/10 text-sell",
};

const SCOPE_LABEL: Record<MetricScope, string> = {
  BACKTEST: "BACKTEST",
  OOS: "OOS",
  FORWARD_PAPER: "FORWARD PAPER",
  LIVE_DISABLED: "LIVE — DISABLED",
};

/** Marks which regime a block of metrics belongs to — BACKTEST/OOS/FORWARD PAPER/LIVE must never be visually interchangeable, so every metrics card that shows numbers carries one of these. */
export function MetricScopeBadge({ scope }: { scope: MetricScope }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${SCOPE_STYLE[scope]}`}>{SCOPE_LABEL[scope]}</span>;
}

export type GuardStatus = "PASS" | "BLOCKED" | "AWAITING_APPROVAL" | "UNAVAILABLE";

const GUARD_STYLE: Record<GuardStatus, string> = {
  PASS: "border-buy/30 bg-buy/10 text-buy",
  BLOCKED: "border-sell/30 bg-sell/10 text-sell",
  AWAITING_APPROVAL: "border-wait/30 bg-wait/10 text-wait",
  UNAVAILABLE: "border-border bg-surface-raised text-muted",
};

export function GuardStatusBadge({ status }: { status: GuardStatus }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${GUARD_STYLE[status]}`}>{status.replace(/_/g, " ")}</span>;
}
