import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/novacore/EmptyState";
import { Card, CardBody } from "@/components/ui/Card";
import { formatPct, formatReportValue, formatUsd } from "@/novacore/reports/daily-close/format";
import { listDailyCloseReports } from "@/novacore/reports/daily-close/list-reports";

/** Block 10.1 §18 — "Today" (if generated) and every previous session, newest first. Each report is immutable, read exactly as it was recorded. */
export default function NovaCoreReportsPage() {
  const reports = [...listDailyCloseReports()].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <PageHeader title="Reportes diarios" description="Un resumen consolidado al cierre de cada sesión de mercado — RS3M (Paper) y C-A (Shadow). Solo lectura." />

      {reports.length === 0 ? (
        <Card>
          <CardBody className="p-4">
            <EmptyState variant="noData" message="Todavía no hay reportes generados." detail="El Daily Close Report se genera automáticamente después del cierre de cada sesión de NYSE." />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Link key={report.date} href={`/novacore/reports/daily/${report.date}`}>
              <Card className="transition-colors hover:border-accent/40">
                <CardBody className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{report.date}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        Portfolio: {formatReportValue(report.portfolio.dailyPnlUsd, formatUsd)} ({formatReportValue(report.portfolio.dailyPnlPct, formatPct)})
                      </p>
                    </div>
                    {report.attention.length > 0 ? (
                      <span className="rounded-full border border-wait/30 bg-wait/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-wait">{report.attention.length} ATENCIÓN</span>
                    ) : (
                      <span className="rounded-full border border-buy/30 bg-buy/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-buy">OK</span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] text-muted">RS3M (Paper)</p>
                      <p className="font-mono text-sm text-foreground">{formatReportValue(report.rs3m.dailyPnlPct, formatPct)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted">C-A (Shadow)</p>
                      <p className="font-mono text-sm text-foreground">{formatReportValue(report.ca.dailyShadowPnlPct, formatPct)}</p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
