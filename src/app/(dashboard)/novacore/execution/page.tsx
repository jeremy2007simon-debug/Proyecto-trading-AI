import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { HealthBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { getRs3mExecutionSnapshot } from "@/novacore/execution-center/adapters/rs3m-execution-adapter";
import { getNovaCorePortfolioSnapshot } from "@/novacore/portfolio/adapters/rs3m-portfolio-adapter";

export default async function NovaCoreExecutionPage() {
  const [execution, portfolio] = await Promise.all([getRs3mExecutionSnapshot(), getNovaCorePortfolioSnapshot()]);

  return (
    <div>
      <PageHeader title="Execution Center" description="Broker, account, positions, orders, approvals, guards. Read / monitor only — no controls that bypass existing safety guards." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Broker" value={execution.broker} hint={execution.environment} />
        <StatTile label="Current position" value={execution.currentPosition.symbol ?? execution.currentPosition.state} />
        <StatTile label="Orders submitted" value={execution.ordersSubmittedTotal} />
        <StatTile label="Approval" value={execution.approval.approvedForCurrentMonth ? "Approved" : execution.approval.awaitingApproval ? "Awaiting" : "Not required yet"} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="RS3M_CANDIDATE_V1" description={`Candidate hash ${execution.candidateHash}`} />
          <CardBody className="space-y-3 p-4 text-sm">
            <div className="flex justify-between"><span className="text-muted">Current position</span><span className="text-foreground">{execution.currentPosition.detail}</span></div>
            <div className="flex justify-between"><span className="text-muted">Last known signal</span><span className="text-foreground">{execution.lastKnownSignal ? `${execution.lastKnownSignal.winner ?? "n/a"} (${execution.lastKnownSignal.decisionMonth})` : "None recorded yet"}</span></div>
            <div className="flex justify-between"><span className="text-muted">Decision month</span><span className="text-foreground">{execution.approval.currentDecisionMonth}</span></div>
            <div className="flex justify-between"><span className="text-muted">Approval required</span><span className="text-foreground">{execution.approval.required ? "Yes" : "No"}</span></div>
            <div className="flex justify-between"><span className="text-muted">Routine</span><HealthBadge status={execution.routine.status} /></div>
            <p className="pt-2 text-xs text-muted-foreground">{execution.routine.detail}</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Alpaca PAPER account" description={portfolio.available ? "Live read" : "Unavailable in this environment"} />
          <CardBody className="p-4">
            {portfolio.available ? (
              <div className="grid grid-cols-3 gap-3">
                <StatTile label="Equity" value={`$${portfolio.totalEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
                <StatTile label="Cash" value={`$${portfolio.totalCash.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
                <StatTile label="Positions" value={portfolio.positions.length} />
              </div>
            ) : (
              <p className="text-sm text-muted">{portfolio.unavailableReason}</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader title="Source of truth" />
          <CardBody className="space-y-1 p-4 text-xs">
            {Object.entries(execution.sourceOfTruth).map(([field, source]) => (
              <div key={field} className="flex flex-col gap-0.5 border-b border-border-subtle py-1.5 last:border-0 sm:flex-row sm:justify-between">
                <span className="text-muted">{field}</span>
                <span className="text-muted-foreground">{source}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
