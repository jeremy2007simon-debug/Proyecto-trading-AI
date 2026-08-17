import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataUnavailableNotice } from "@/components/dashboard/DataUnavailableNotice";

describe("DataUnavailableNotice", () => {
  it("renders the given reason", () => {
    render(<DataUnavailableNotice reason="Market data provider not configured." />);
    expect(screen.getByText("Data unavailable")).toBeInTheDocument();
    expect(screen.getByText("Market data provider not configured.")).toBeInTheDocument();
  });
});
