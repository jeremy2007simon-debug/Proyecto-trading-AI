import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConsensusPanel } from "@/components/consensus/ConsensusPanel";
import { mockConsensusPanelData } from "@/lib/mock/consensus-panel.mock";

describe("ConsensusPanel", () => {
  it("renders the final decision and consensus score", () => {
    render(<ConsensusPanel data={mockConsensusPanelData} />);

    expect(
      screen.getByText(mockConsensusPanelData.finalDecision),
    ).toBeInTheDocument();
    expect(screen.getByText(/\+?45/)).toBeInTheDocument();
  });

  it("shows the risk decision as approved when riskApproved is true", () => {
    render(<ConsensusPanel data={mockConsensusPanelData} />);
    expect(screen.getByText(/Approved/)).toBeInTheDocument();
  });

  it("shows the rejection reason when the risk decision is rejected", () => {
    render(
      <ConsensusPanel
        data={{
          ...mockConsensusPanelData,
          riskApproved: false,
          riskRejectionReason: "Daily loss limit reached",
        }}
      />,
    );
    expect(
      screen.getByText(/Rejected — Daily loss limit reached/),
    ).toBeInTheDocument();
  });
});
