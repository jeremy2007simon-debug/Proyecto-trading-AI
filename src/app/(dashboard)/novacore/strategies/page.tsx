import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StrategyStatusBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody } from "@/components/ui/Card";
import { listNovaCoreStrategies } from "@/novacore/strategy-hub/registry";

export default function NovaCoreStrategiesPage() {
  const strategies = listNovaCoreStrategies();

  return (
    <div>
      <PageHeader title="Strategy Hub" description="Todas las estrategias que sigue NovaCore, en investigación, paper y (en el futuro) en vivo. Solo lectura." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {strategies.map((strategy) => (
          <Link key={strategy.id} href={`/novacore/strategies/${strategy.id}`}>
            <Card className="h-full transition-colors hover:border-accent/40">
              <CardBody className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{strategy.name}</p>
                    <p className="mt-0.5 text-xs text-muted">{strategy.family.replace(/_/g, " ")} · v{strategy.version}</p>
                  </div>
                  <StrategyStatusBadge status={strategy.status} />
                </div>
                <p className="mt-3 text-xs text-muted">{strategy.hypothesis}</p>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{strategy.broker ?? "—"} · {strategy.environment ?? "—"}</span>
                  {strategy.performance?.historical ? <span>CAGR {strategy.performance.historical.cagrPct.toFixed(2)}%</span> : null}
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
