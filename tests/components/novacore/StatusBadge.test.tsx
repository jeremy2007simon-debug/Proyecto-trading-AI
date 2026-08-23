import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StrategyStatusBadge } from "@/components/novacore/StatusBadge";

/**
 * Block 10 §4/§18/§27 — SHADOW must never be visually confusable with
 * PAPER. This is the first component-level test in the repo (the RTL/
 * jsdom infra was already wired in `vitest.config.mts` but unused);
 * checking the actual rendered className is the only way to prove two
 * statuses are NOT styled identically, rather than just trusting the
 * source read.
 */
describe("StrategyStatusBadge — SHADOW vs PAPER must be visually distinct", () => {
  it("renders SHADOW_READY and SHADOW_RUNNING with a badge class distinct from PAPER_READY/PAPER_RUNNING", () => {
    const { container: shadowReady } = render(<StrategyStatusBadge status="SHADOW_READY" />);
    const { container: shadowRunning } = render(<StrategyStatusBadge status="SHADOW_RUNNING" />);
    const { container: paperReady } = render(<StrategyStatusBadge status="PAPER_READY" />);
    const { container: paperRunning } = render(<StrategyStatusBadge status="PAPER_RUNNING" />);

    const shadowReadyClass = shadowReady.querySelector("span")?.className;
    const shadowRunningClass = shadowRunning.querySelector("span")?.className;
    const paperReadyClass = paperReady.querySelector("span")?.className;
    const paperRunningClass = paperRunning.querySelector("span")?.className;

    expect(shadowReadyClass).toBeDefined();
    expect(shadowReadyClass).not.toBe(paperReadyClass);
    expect(shadowReadyClass).not.toBe(paperRunningClass);
    expect(shadowRunningClass).not.toBe(paperReadyClass);
    expect(shadowRunningClass).not.toBe(paperRunningClass);
  });

  it("renders the human-readable label with underscores replaced by spaces", () => {
    render(<StrategyStatusBadge status="SHADOW_READY" />);
    expect(screen.getByText("SHADOW READY")).toBeInTheDocument();
  });

  it("every NovaCoreStrategyStatus value renders without throwing (exhaustive style map)", () => {
    const statuses = ["RESEARCH", "REJECTED", "CANDIDATE", "PAPER_READY", "PAPER_RUNNING", "SHADOW_READY", "SHADOW_RUNNING", "FORWARD_VERIFIED", "LIVE_ELIGIBLE", "LIVE"] as const;
    for (const status of statuses) {
      expect(() => render(<StrategyStatusBadge status={status} />)).not.toThrow();
    }
  });
});
