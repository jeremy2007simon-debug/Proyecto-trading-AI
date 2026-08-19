import type { HealthStatus, NovaCoreStrategyStatus } from "@/novacore/shared/types";

const STRATEGY_STATUS_STYLE: Record<NovaCoreStrategyStatus, string> = {
  RESEARCH: "border-accent/30 bg-accent/10 text-accent",
  REJECTED: "border-sell/30 bg-sell/10 text-sell",
  CANDIDATE: "border-accent/30 bg-accent/10 text-accent",
  PAPER_READY: "border-wait/30 bg-wait/10 text-wait",
  PAPER_RUNNING: "border-accent/30 bg-accent/10 text-accent",
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
