import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function SystemLogsPage() {
  return (
    <div>
      <PageHeader
        title="System Logs"
        description="Structured event log for every module in the pipeline."
      />
      <ComingSoon
        title="No log entries yet"
        description="Logs will appear here once a Logger (src/core/logging/types.ts) implementation starts writing to system_logs."
        plannedFeatures={[
          "Regime changes, strategy activation/deactivation, signal generation",
          "Consensus calculations and detected conflicts",
          "Risk limit events and kill switch activity",
          "API and market data errors",
        ]}
      />
    </div>
  );
}
