import { ConsensusPanel } from "@/components/consensus/ConsensusPanel";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { MockDataBadge } from "@/components/ui/MockDataBadge";
import { mockConsensusPanelData } from "@/lib/mock/consensus-panel.mock";

export default function SignalsPage() {
  return (
    <div>
      <PageHeader
        title="Signals"
        description="Consensus Engine output and the resulting final decision, after Risk Engine review."
        action={<MockDataBadge />}
      />
      <ConsensusPanel data={mockConsensusPanelData} />
    </div>
  );
}
