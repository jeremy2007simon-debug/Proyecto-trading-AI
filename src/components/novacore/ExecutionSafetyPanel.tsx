import { GuardStatusBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { Rs3mExecutionSafety } from "@/novacore/execution-center/adapters/rs3m-guards-adapter";

const APPROVAL_LABEL: Record<Rs3mExecutionSafety["approvalStatus"], string> = {
  REQUIRED: "Required — awaiting approval",
  APPROVED: "Approved",
  NOT_APPROVED: "Not approved",
  "N/A": "N/A",
};

/**
 * "Execution Safety" panel (Observability Upgrade §5). Read / monitor
 * only — nothing here can grant approval, submit an order, or bypass a
 * guard. Every guard shown is one `safety-guards.ts` actually enforces;
 * see `rs3m-guards-adapter.ts` for why a guard reports UNAVAILABLE rather
 * than a false PASS when no signal has ever been computed.
 */
export function ExecutionSafetyPanel({ safety }: { safety: Rs3mExecutionSafety }) {
  return (
    <Card>
      <CardHeader title="Execution safety" description="Read / monitor only — no action can be taken from this panel." />
      <CardBody className="p-4">
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted">Approval</p>
            <p className="text-sm text-foreground">{APPROVAL_LABEL[safety.approvalStatus]}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Orders submitted</p>
            <p className="font-mono text-sm text-foreground">{safety.ordersSubmitted}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Execution mode</p>
            <p className="font-mono text-sm text-foreground">{safety.executionMode}</p>
          </div>
          <div>
            <p className="text-xs text-muted">LIVE</p>
            <p className="font-mono text-sm text-sell">{safety.liveStatus.replace(/_/g, " ")}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          {safety.guards.map((guard) => (
            <div key={guard.guardCode} className="flex items-start justify-between gap-3 border-b border-border-subtle py-2 text-sm last:border-0">
              <div>
                <p className="text-foreground">{guard.name}</p>
                <p className="mt-0.5 text-xs text-muted">{guard.detail}</p>
              </div>
              <GuardStatusBadge status={guard.status} />
            </div>
          ))}
        </div>

        <p className="mt-3 font-mono text-[11px] text-muted-foreground">Paper endpoint: {safety.paperEndpoint}</p>
      </CardBody>
    </Card>
  );
}
