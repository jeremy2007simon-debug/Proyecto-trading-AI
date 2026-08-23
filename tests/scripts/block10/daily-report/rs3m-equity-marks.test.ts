import { afterEach, describe, expect, it, vi } from "vitest";

const existsSyncMock = vi.fn();
const readFileSyncMock = vi.fn();
const appendFileSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();

vi.mock("node:fs", () => {
  const mocked = {
    existsSync: (...args: unknown[]) => existsSyncMock(...args),
    readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
    appendFileSync: (...args: unknown[]) => appendFileSyncMock(...args),
    mkdirSync: (...args: unknown[]) => mkdirSyncMock(...args),
  };
  return { ...mocked, default: mocked };
});

describe("Block 10.1 §12 — rs3m-equity-marks: the report engine's own ledger, never RS3M's", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns [] when no marks have been recorded yet", async () => {
    existsSyncMock.mockReturnValue(false);
    const { readRs3mEquityMarks } = await import("../../../../scripts/block10/daily-report/rs3m-equity-marks");
    expect(readRs3mEquityMarks()).toEqual([]);
  });

  it("appends one JSONL line ending in newline, under results/block10/daily-reports/, never results/block6", async () => {
    const { appendRs3mEquityMark } = await import("../../../../scripts/block10/daily-report/rs3m-equity-marks");
    appendRs3mEquityMark({ date: "2026-09-01", equityUsd: 100000, cashUsd: 50000, recordedAt: "2026-09-01T21:30:00.000Z" });

    expect(mkdirSyncMock).toHaveBeenCalledWith(expect.stringContaining("results/block10/daily-reports"), { recursive: true });
    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);
    const [path, content] = appendFileSyncMock.mock.calls[0] as [string, string];
    expect(path).not.toContain("block6");
    expect(path).toContain("rs3m-equity-marks.jsonl");
    expect(content.endsWith("\n")).toBe(true);
    expect(JSON.parse(content.trim())).toEqual({ date: "2026-09-01", equityUsd: 100000, cashUsd: 50000, recordedAt: "2026-09-01T21:30:00.000Z" });
  });

  it("parses marks back in file order", async () => {
    existsSyncMock.mockReturnValue(true);
    const m1 = { date: "2026-09-01", equityUsd: 100000, cashUsd: 50000, recordedAt: "t1" };
    const m2 = { date: "2026-09-02", equityUsd: 100120, cashUsd: 50000, recordedAt: "t2" };
    readFileSyncMock.mockReturnValue(`${JSON.stringify(m1)}\n${JSON.stringify(m2)}\n`);
    const { readRs3mEquityMarks } = await import("../../../../scripts/block10/daily-report/rs3m-equity-marks");
    expect(readRs3mEquityMarks()).toEqual([m1, m2]);
  });
});
