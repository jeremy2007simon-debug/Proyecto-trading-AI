import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { formatPct, formatReportValue, formatUsd, formatUsdPlain } from "@/novacore/reports/daily-close/format";
import { getDailyCloseReport } from "@/novacore/reports/daily-close/list-reports";
import type { ReportValue } from "@/novacore/reports/daily-close/types";

function pnlClass(v: ReportValue<number>): string {
  if (v.status !== "OK") return "";
  return v.value >= 0 ? "text-buy" : "text-sell";
}

export default async function DailyCloseReportPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const report = getDailyCloseReport(date);
  if (!report) notFound();

  return (
    <div>
      <PageHeader title={`Reporte diario — ${report.date}`} description={`Generado ${new Date(report.generatedAt).toLocaleString("es")} · Salud del sistema: ${report.systemHealth}`} />

      {/* Human-friendly summary first — the briefing, not the accounting table (§30) */}
      <Card className="border-accent/20">
        <CardBody className="p-4">
          <p className="whitespace-pre-line text-sm text-foreground">{report.humanSummaryEs}</p>
        </CardBody>
      </Card>

      {report.attention.length > 0 ? (
        <div className="mt-4">
          <Card className="border-wait/30 bg-wait/5">
            <CardHeader title="Atención" />
            <CardBody className="space-y-2 p-4">
              {report.attention.map((item, i) => (
                <p key={i} className="text-sm text-wait">
                  {item.message}
                </p>
              ))}
            </CardBody>
          </Card>
        </div>
      ) : null}

      <div className="mt-4">
        <Card>
          <CardHeader title="Portfolio" description="Cuenta Paper — solo RS3M mantiene capital real." />
          <CardBody className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <StatTile label="Equity" value={formatReportValue(report.portfolio.paperEquityUsd, formatUsdPlain)} />
            <StatTile label="P&amp;L diario" value={formatReportValue(report.portfolio.dailyPnlUsd, formatUsd)} valueClassName={pnlClass(report.portfolio.dailyPnlUsd)} hint={formatReportValue(report.portfolio.dailyPnlPct, formatPct)} />
            <StatTile label="P&amp;L acumulado" value={formatReportValue(report.portfolio.accumulatedPnlUsd, formatUsd)} valueClassName={pnlClass(report.portfolio.accumulatedPnlUsd)} />
            <StatTile label="Cash" value={formatReportValue(report.portfolio.cashUsd, formatUsdPlain)} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <Card className="border-accent/20">
          <CardHeader title="RS3M — PAPER" />
          <CardBody className="p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Estado" value={report.rs3m.status} />
              <StatTile label="Señal hoy" value={formatReportValue(report.rs3m.signalToday, (v) => v)} />
              <StatTile label="Posición al cierre" value={formatReportValue(report.rs3m.positionAtClose, (v) => v)} />
              <StatTile label="Aprobación" value={report.rs3m.approvalStatus} />
              <StatTile label="Órdenes hoy" value={formatReportValue(report.rs3m.ordersToday, String)} />
              <StatTile label="Fills hoy" value={formatReportValue(report.rs3m.fillsToday, String)} />
              <StatTile label="Guards" value={report.rs3m.guardsStatus} />
              <StatTile label="Salud" value={report.rs3m.health} />
            </div>
            {report.rs3m.lastActivity.status === "OK" ? <p className="mt-3 text-[11px] text-muted-foreground">Última actividad: {report.rs3m.lastActivity.value.summary}</p> : null}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <Card className="border-purple-400/20">
          <CardHeader title="C-A — SHADOW (sin órdenes reales)" />
          <CardBody className="p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Estado" value={report.ca.status} />
              <StatTile label="Señal hoy" value={formatReportValue(report.ca.signalToday, (v) => v)} />
              <StatTile label="Posición hipotética" value={report.ca.hypotheticalPositionAtClose} />
              <StatTile label="Entrada/Salida" value={formatReportValue(report.ca.shadowEntryExit, (v) => v)} />
              <StatTile label="P&amp;L shadow diario" value={formatReportValue(report.ca.dailyShadowPnlPct, formatPct)} valueClassName={pnlClass(report.ca.dailyShadowPnlPct)} />
              <StatTile label="P&amp;L shadow acumulado" value={formatReportValue(report.ca.accumulatedShadowPnlPct, formatPct)} valueClassName={pnlClass(report.ca.accumulatedShadowPnlPct)} />
              <StatTile label="Fill hipotético" value={formatReportValue(report.ca.hypotheticalFillPrice, formatUsdPlain)} />
              <StatTile label="Costo" value={formatReportValue(report.ca.costBps, (v) => `${v}bps`)} />
              <StatTile label="Guards" value={report.ca.guardsStatus} />
              <StatTile label="Días forward" value={report.ca.forwardDays} />
              <StatTile label="Trades shadow" value={report.ca.shadowTrades} />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader title="Mercado — SPY" description={report.benchmark.source} />
          <CardBody className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <StatTile label="Cierre SPY" value={formatReportValue(report.benchmark.spyClose, formatUsdPlain)} />
            <StatTile label="Cambio diario" value={formatReportValue(report.benchmark.spyDailyChangePct, formatPct)} valueClassName={pnlClass(report.benchmark.spyDailyChangePct)} />
            <StatTile label="RS3M vs. SPY" value={formatReportValue(report.benchmark.rs3mDailyReturnPct, formatPct)} />
            <StatTile label="C-A vs. SPY" value={formatReportValue(report.benchmark.caShadowDailyReturnPct, formatPct)} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader title="Fuente de la verdad" description="De dónde viene cada dato de este reporte." />
          <CardBody className="space-y-1 p-4 text-xs">
            {Object.entries(report.sourceMetadata).map(([field, source]) => (
              <div key={field} className="flex flex-col gap-0.5 border-b border-border-subtle py-1.5 last:border-0 sm:flex-row sm:justify-between">
                <span className="text-muted">{field}</span>
                <span className="text-muted-foreground">{source}</span>
              </div>
            ))}
            <div className="flex flex-col gap-0.5 border-b border-border-subtle py-1.5 last:border-0 sm:flex-row sm:justify-between">
              <span className="text-muted">frescura de datos</span>
              <span className="text-muted-foreground">{report.dataFreshness}</span>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
