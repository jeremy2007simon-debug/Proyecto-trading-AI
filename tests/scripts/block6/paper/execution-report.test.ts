import { describe, expect, it } from "vitest";
import { buildExecutionReportMarkdown } from "../../../../scripts/block6/paper/execution-report";
import type { ForwardEvidenceRecord } from "@/core/paper-trading/rs3m/forward-evidence";

function record(overrides: Partial<ForwardEvidenceRecord> = {}): ForwardEvidenceRecord {
  return {
    timestamp: "2026-09-02T13:35:00Z",
    candidateId: "RS3M_CANDIDATE_V1",
    candidateHash: "1c28b57c",
    decisionMonth: "2026-08",
    dataCutoff: "2026-08-31T20:00:00Z",
    ranking: [
      { market: "DOWJONES", trailingReturnPct: 5.9 },
      { market: "SP500", trailingReturnPct: 4.2 },
    ],
    winner: "DOWJONES",
    accountEquityUsd: 100000,
    accountEquityAfterUsd: 99920,
    positionsBefore: [],
    targetAsset: "DIA",
    proposedOrders: [{ symbol: "DIA", side: "buy", notionalUsd: 100000, reason: "Top-ranked asset." }],
    submittedOrders: [
      { orderId: "o1", clientOrderId: "rs3m-2026-08-dia-buy", symbol: "DIA", side: "buy", notionalUsd: 100000, status: "filled", filledAt: "2026-09-02T13:35:02Z", filledAvgPrice: 501.5, filledQty: 199.4 },
    ],
    averageFillPriceBySymbol: { DIA: 501.5 },
    estimatedTurnoverPct: 100,
    referenceRebalanceCostBps: 20,
    positionsAfter: [{ symbol: "DIA", marketValue: 99920 }],
    guardViolations: [],
    finalState: "EXECUTED",
    skipReason: undefined,
    anyOrderStillInFlight: false,
    mode: "PAPER_ONLY",
    ...overrides,
  };
}

describe("buildExecutionReportMarkdown", () => {
  it("includes the ranking, winner, and target asset", () => {
    const md = buildExecutionReportMarkdown(record());
    expect(md).toContain("DOWJONES");
    expect(md).toContain("5.90");
    expect(md).toContain("**Activo objetivo:** DIA");
  });

  it("includes proposed AND submitted orders with fill details", () => {
    const md = buildExecutionReportMarkdown(record());
    expect(md).toContain("o1");
    expect(md).toContain("filled");
    expect(md).toContain("501.50");
    expect(md).toContain("199.4000");
  });

  it("reports 'sin precio de referencia' for slippage when no reference price is supplied", () => {
    const md = buildExecutionReportMarkdown(record());
    expect(md).toContain("sin precio de referencia");
  });

  it("computes slippage % when a reference execution price IS supplied", () => {
    const md = buildExecutionReportMarkdown(record(), { referenceExecutionPriceBySymbol: { DIA: 500 } });
    // (501.5 - 500) / 500 * 100 = 0.3%
    expect(md).toContain("0.300%");
  });

  it("includes equity before/after and positions before/after", () => {
    const md = buildExecutionReportMarkdown(record());
    expect(md).toContain("Equity ANTES: $100000.00");
    expect(md).toContain("Equity DESPUÉS: $99920.00");
    expect(md).toContain("DIA=$99920.00");
  });

  it("surfaces a broker error / skip reason prominently when present", () => {
    const md = buildExecutionReportMarkdown(record({ finalState: "SKIPPED", skipReason: "Order submission failed for DIA buy: insufficient buying power" }));
    expect(md).toContain("insufficient buying power");
  });

  it("clearly states no orders were sent when submittedOrders is empty", () => {
    const md = buildExecutionReportMarkdown(record({ submittedOrders: [], finalState: "BLOCKED" }));
    expect(md).toContain("ninguna orden fue enviada");
  });

  it("flags a still-in-flight order for manual review", () => {
    const md = buildExecutionReportMarkdown(record({ anyOrderStillInFlight: true }));
    expect(md).toContain("SÍ — revisar manualmente");
  });

  it("lists guard violations when present, and says all passed when not", () => {
    const clean = buildExecutionReportMarkdown(record());
    expect(clean).toContain("Todos los guards pasaron");

    const blocked = buildExecutionReportMarkdown(record({ guardViolations: [{ guard: "STALE_SIGNAL", reason: "too old" }] }));
    expect(blocked).toContain("STALE_SIGNAL");
    expect(blocked).toContain("too old");
  });
});
