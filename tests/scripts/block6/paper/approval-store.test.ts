import { afterEach, describe, expect, it, vi } from "vitest";
import type { RebalanceApproval } from "@/core/paper-trading/rs3m/approval";

const existsSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const readFileSyncMock = vi.fn();

vi.mock("node:fs", () => {
  const mocked = {
    existsSync: (...args: unknown[]) => existsSyncMock(...args),
    mkdirSync: (...args: unknown[]) => mkdirSyncMock(...args),
    writeFileSync: (...args: unknown[]) => writeFileSyncMock(...args),
    readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
  };
  return { ...mocked, default: mocked };
});

function approval(overrides: Partial<RebalanceApproval> = {}): RebalanceApproval {
  return { decisionMonth: "2026-08", candidateHash: "1c28b57c", approvedAt: "2026-09-02T10:00:00Z", approvedBy: "test", ...overrides };
}

describe("hasValidApproval", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns false when no approval file exists for the month", async () => {
    existsSyncMock.mockReturnValue(false);
    const { hasValidApproval } = await import("../../../../scripts/block6/paper/approval-store");

    expect(await hasValidApproval("2026-08", "1c28b57c")).toBe(false);
  });

  it("returns true only when BOTH decisionMonth and candidateHash exactly match", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(approval()));
    const { hasValidApproval } = await import("../../../../scripts/block6/paper/approval-store");

    expect(await hasValidApproval("2026-08", "1c28b57c")).toBe(true);
  });

  it("returns false when the candidate hash does not match (e.g. approval predates a tampered/edited candidate)", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(approval({ candidateHash: "1c28b57c" })));
    const { hasValidApproval } = await import("../../../../scripts/block6/paper/approval-store");

    expect(await hasValidApproval("2026-08", "some-different-hash")).toBe(false);
  });

  it("returns false when the decision month does not match (an approval never carries over to a different month)", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify(approval({ decisionMonth: "2026-08" })));
    const { hasValidApproval } = await import("../../../../scripts/block6/paper/approval-store");

    expect(await hasValidApproval("2026-09", "1c28b57c")).toBe(false);
  });
});

describe("writeApproval", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates the month's directory and writes the approval record", async () => {
    const { writeApproval } = await import("../../../../scripts/block6/paper/approval-store");
    writeApproval(approval());

    expect(mkdirSyncMock).toHaveBeenCalledWith(expect.stringContaining("2026-08"), { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [path, content] = writeFileSyncMock.mock.calls[0] as [string, string];
    expect(path).toContain("approval.json");
    expect(JSON.parse(content)).toEqual(approval());
  });
});

describe("awaiting-approval marker", () => {
  afterEach(() => vi.clearAllMocks());

  it("hasAwaitingApprovalMarker is false when nothing was recorded yet", async () => {
    existsSyncMock.mockReturnValue(false);
    const { hasAwaitingApprovalMarker } = await import("../../../../scripts/block6/paper/approval-store");

    expect(hasAwaitingApprovalMarker("2026-08")).toBe(false);
  });

  it("writeAwaitingApprovalMarker persists a snapshot, and it can be read back", async () => {
    const { writeAwaitingApprovalMarker } = await import("../../../../scripts/block6/paper/approval-store");
    writeAwaitingApprovalMarker("2026-08", { winner: "DOWJONES" });

    expect(mkdirSyncMock).toHaveBeenCalled();
    const [path, content] = writeFileSyncMock.mock.calls[0] as [string, string];
    expect(path).toContain("awaiting-approval.json");
    expect(JSON.parse(content).snapshot).toEqual({ winner: "DOWJONES" });
  });

  it("readAwaitingApprovalMarker returns undefined when no marker exists", async () => {
    existsSyncMock.mockReturnValue(false);
    const { readAwaitingApprovalMarker } = await import("../../../../scripts/block6/paper/approval-store");

    expect(readAwaitingApprovalMarker("2026-08")).toBeUndefined();
  });
});
