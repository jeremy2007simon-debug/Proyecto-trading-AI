import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MockDataBadge } from "@/components/ui/MockDataBadge";

describe("MockDataBadge", () => {
  it("renders the MOCK DATA label", () => {
    render(<MockDataBadge />);
    expect(screen.getByText("MOCK DATA")).toBeInTheDocument();
  });
});
