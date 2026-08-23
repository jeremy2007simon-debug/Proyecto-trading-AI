import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/novacore/EmptyState";
import { NewsCard } from "@/components/novacore/NewsCard";
import { HealthBadge, StrategyStatusBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatFreshness } from "@/lib/format-freshness";
import { getRs3mExecutionSafety } from "@/novacore/execution-center/adapters/rs3m-guards-adapter";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";
import { getMarketBenchmarkSeries } from "@/novacore/market-context/adapters/market-benchmark-adapter";
import { getMarketNews } from "@/novacore/market-news/adapters/get-market-news";
import { getNovaCorePortfolioSnapshot } from "@/novacore/portfolio/adapters/rs3m-portfolio-adapter";
import { getRs3mRiskSnapshot } from "@/novacore/risk-analytics/adapters/rs3m-risk-adapter";
import { getRs3mCurrentSignal } from "@/novacore/strategy-hub/adapters/rs3m-signal-adapter";
import { getCaShadowSnapshot } from "@/novacore/strategy-hub/adapters/ca-shadow-snapshot-adapter";
import { listNovaCoreStrategies } from "@/novacore/strategy-hub/registry";

const ACTIVE_STATUSES = new Set(["PAPER_READY", "PAPER_RUNNING", "SHADOW_READY", "SHADOW_RUNNING", "FORWARD_VERIFIED", "LIVE_ELIGIBLE", "LIVE"]);

/**
 * §2, §24 — NovaCore home, rebuilt around a small executive summary
 * instead of a dense grid of stat tiles: "is it working, how much
 * capital, am I up or down, what's active, does anything need my
 * attention, what's the market doing, what's the latest news that
 * matters". Everything else lives one tap away (Market/Bots/More).
 */
export default async function NovaCoreHomePage() {
  const [strategies, portfolio, health, risk, signal, safety, spy, news, caShadow] = await Promise.all([
    Promise.resolve(listNovaCoreStrategies()),
    getNovaCorePortfolioSnapshot(),
    getRs3mHealth(),
    getRs3mRiskSnapshot(),
    Promise.resolve(getRs3mCurrentSignal()),
    getRs3mExecutionSafety(),
    getMarketBenchmarkSeries("SP500", "1D"),
    getMarketNews({ limit: 2 }),
    Promise.resolve(getCaShadowSnapshot()),
  ]);
  const caStrategy = strategies.find((s) => s.id === "CA_CANDIDATE_V1");

  const activeCount = strategies.filter((s) => ACTIVE_STATUSES.has(s.status)).length;
  const researchCount = strategies.length - activeCount;

  const forwardAvailable = risk.forwardMetrics.available;
  const forwardPnl = forwardAvailable ? risk.forwardMetrics.totalReturnPct : undefined;

  const needsAttention = safety.approvalStatus === "REQUIRED" || safety.overallStatus === "BLOCKED" || health.status === "ERROR" || health.status === "DEGRADED";

  return (
    <div>
      <PageHeader title="NovaCore" description="Resumen ejecutivo — solo lectura." />

      <div className="space-y-4">
        {/* Portfolio hero */}
        <Card>
          <CardBody className="p-5">
            <p className="text-xs text-muted">Portfolio (Paper)</p>
            {portfolio.available ? (
              <>
                <p className="mt-1 font-mono text-3xl font-semibold text-foreground">${portfolio.totalEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                {forwardPnl !== undefined ? (
                  <p className={`mt-1 font-mono text-sm ${forwardPnl >= 0 ? "text-buy" : "text-sell"}`}>
                    {forwardPnl >= 0 ? "+" : ""}
                    {forwardPnl.toFixed(2)}% desde el inicio del forward
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted">Sin retorno forward todavía — {risk.forwardMetrics.available ? "" : "0 meses observados"}</p>
                )}
                {portfolio.lastSyncedAt ? <p className="mt-1 text-[11px] text-muted-foreground">Actualizado {formatFreshness(portfolio.lastSyncedAt)}</p> : null}
              </>
            ) : (
              <EmptyState variant="notConnected" message="Cuenta Paper no disponible en este entorno." detail={portfolio.unavailableReason} />
            )}
          </CardBody>
        </Card>

        {/* System + Strategies row */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardBody className="p-4">
              <p className="text-xs text-muted">Sistema</p>
              <div className="mt-1.5">
                <HealthBadge status={health.status} />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">{health.checks.length} checks</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="p-4">
              <p className="text-xs text-muted">Estrategias</p>
              <p className="mt-1.5 font-mono text-lg font-semibold text-foreground">
                {activeCount} activa{activeCount === 1 ? "" : "s"}
              </p>
              <p className="text-[11px] text-muted-foreground">{researchCount} en investigación</p>
            </CardBody>
          </Card>
        </div>

        {/* Attention banner */}
        <Link href={needsAttention ? "/novacore/bots/RS3M_CANDIDATE_V1" : "/novacore/more"}>
          <Card className={needsAttention ? "border-wait/30 bg-wait/5" : "border-buy/30 bg-buy/5"}>
            <CardBody className="flex items-center gap-3 p-4">
              {needsAttention ? <AlertTriangle className="size-5 shrink-0 text-wait" strokeWidth={2} /> : <CheckCircle2 className="size-5 shrink-0 text-buy" strokeWidth={2} />}
              <div>
                <p className={`text-sm font-medium ${needsAttention ? "text-wait" : "text-buy"}`}>{needsAttention ? "Requiere tu atención" : "Nada requiere atención"}</p>
                <p className="text-xs text-muted">
                  {safety.approvalStatus === "REQUIRED"
                    ? "Aprobación pendiente para el mes de decisión actual."
                    : safety.overallStatus === "BLOCKED"
                      ? "Ejecución bloqueada por al menos un guard."
                      : health.status === "ERROR" || health.status === "DEGRADED"
                        ? "Al menos un check de salud no está HEALTHY."
                        : "Guards, aprobación y salud del sistema están en orden."}
                </p>
              </div>
            </CardBody>
          </Card>
        </Link>

        {/* RS3M mini card */}
        <Link href="/novacore/bots/RS3M_CANDIDATE_V1">
          <Card className="transition-colors hover:border-accent/40">
            <CardBody className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">RS3M</p>
                <p className="mt-0.5 text-xs text-muted">Señal: {signal.winner ?? (signal.status === "UNAVAILABLE" ? "N/D" : "CASH")}</p>
              </div>
              <StrategyStatusBadge status={strategies[0]?.status ?? "PAPER_READY"} />
            </CardBody>
          </Card>
        </Link>

        {/* C-A mini card — SHADOW, deliberately visually distinct from RS3M's PAPER card above */}
        {caStrategy ? (
          <Link href="/novacore/bots/CA_CANDIDATE_V1">
            <Card className="border-purple-400/20 transition-colors hover:border-purple-400/40">
              <CardBody className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">C-A — Short-Term Reversal</p>
                  <p className="mt-0.5 text-xs text-purple-400">
                    SHADOW FORWARD · {caShadow.shadow.currentPosition}
                    {caShadow.hasForwardEvidence ? ` · ${caShadow.shadow.realizedShadowPnlPct >= 0 ? "+" : ""}${caShadow.shadow.realizedShadowPnlPct.toFixed(2)}%` : " · sin evidencia forward todavía"}
                  </p>
                </div>
                <StrategyStatusBadge status={caStrategy.status} />
              </CardBody>
            </Card>
          </Link>
        ) : null}

        {/* Market mini card */}
        <Link href="/novacore/market">
          <Card className="transition-colors hover:border-accent/40">
            <CardBody className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted">Mercado — S&amp;P 500 (SPY)</p>
                <span className="text-xs text-accent">Ver mercado →</span>
              </div>
              {spy.available ? (
                <div className="mt-1.5 flex items-baseline gap-3">
                  <span className="font-mono text-2xl font-semibold text-foreground">${spy.lastValue?.toFixed(2)}</span>
                  <span className={`font-mono text-sm ${(spy.percentChange ?? 0) >= 0 ? "text-buy" : "text-sell"}`}>
                    {(spy.percentChange ?? 0) >= 0 ? "+" : ""}
                    {spy.percentChange?.toFixed(2)}%
                  </span>
                </div>
              ) : (
                <p className="mt-1.5 text-sm text-muted">No disponible — {spy.unavailableReason}</p>
              )}
            </CardBody>
          </Card>
        </Link>

        {/* Latest important news */}
        <Card>
          <CardHeader title="Últimas noticias relevantes" action={<Link href="/novacore/market/news" className="text-xs text-accent hover:underline">Ver todas →</Link>} />
          <CardBody className="p-4">
            {news.available && news.items.length > 0 ? (
              <div className="space-y-3">
                {news.items.map((item) => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <EmptyState variant="notConnected" message="Market News no está conectado en este entorno." />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
