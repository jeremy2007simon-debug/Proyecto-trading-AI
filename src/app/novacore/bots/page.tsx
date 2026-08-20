import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { GuardStatusBadge, HealthBadge, StrategyStatusBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody } from "@/components/ui/Card";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";
import { getRs3mExecutionSafety } from "@/novacore/execution-center/adapters/rs3m-guards-adapter";
import { getRs3mExecutionSnapshot } from "@/novacore/execution-center/adapters/rs3m-execution-adapter";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";
import { getRs3mRiskSnapshot } from "@/novacore/risk-analytics/adapters/rs3m-risk-adapter";
import { getRs3mCurrentSignal } from "@/novacore/strategy-hub/adapters/rs3m-signal-adapter";
import { listNovaCoreStrategies } from "@/novacore/strategy-hub/registry";

export default async function NovaCoreBotsPage() {
  const strategies = listNovaCoreStrategies();

  return (
    <div>
      <PageHeader title="Bots" description="Todas las estrategias que sigue NovaCore, en investigación, paper y (en el futuro) en vivo. Solo lectura." />

      <div className="space-y-3">
        {await Promise.all(
          strategies.map(async (strategy) => {
            const isRs3m = strategy.id === RS3M_CANDIDATE_V1.candidateId;
            const [execution, risk, health, safety, signal] = isRs3m
              ? await Promise.all([getRs3mExecutionSnapshot(), getRs3mRiskSnapshot(), getRs3mHealth(), getRs3mExecutionSafety(), Promise.resolve(getRs3mCurrentSignal())])
              : [undefined, undefined, undefined, undefined, undefined];

            const pnl = risk?.forwardMetrics.available ? risk.forwardMetrics.totalReturnPct : undefined;
            const drawdown = risk?.forwardMetrics.available ? risk.forwardMetrics.currentDrawdownPct : undefined;

            return (
              <Link key={strategy.id} href={`/novacore/bots/${strategy.id}`}>
                <Card className="transition-colors hover:border-accent/40">
                  <CardBody className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{strategy.name}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {strategy.broker ?? "—"} · {strategy.environment ?? "—"}
                        </p>
                      </div>
                      <StrategyStatusBadge status={strategy.status} />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <p className="text-[11px] text-muted">P&amp;L forward</p>
                        <p className={`font-mono text-sm ${pnl !== undefined ? (pnl >= 0 ? "text-buy" : "text-sell") : "text-muted"}`}>
                          {pnl !== undefined ? `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}%` : "Sin datos"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted">Drawdown</p>
                        <p className="font-mono text-sm text-foreground">{drawdown !== undefined ? `${drawdown.toFixed(2)}%` : "Sin datos"}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted">Posición</p>
                        <p className="font-mono text-sm text-foreground">{execution?.currentPosition.symbol ?? execution?.currentPosition.state ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted">Última señal</p>
                        <p className="font-mono text-sm text-foreground">{signal?.winner ?? "—"}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {health ? <HealthBadge status={health.status} /> : null}
                      {safety ? <GuardStatusBadge status={safety.overallStatus} /> : null}
                    </div>
                  </CardBody>
                </Card>
              </Link>
            );
          }),
        )}
      </div>
    </div>
  );
}
