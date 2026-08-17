import { describe, expect, it } from "vitest";
import {
  buildExperimentId,
  canonicalJson,
  createExperimentRecord,
  fnv1a,
  type ExperimentSpecFingerprint,
} from "@/core/backtesting/research/experiment-registry";

function baseSpec(): ExperimentSpecFingerprint {
  return {
    strategyId: "momentum-trend",
    strategyVersion: "1.0.0",
    parameters: { rocLookbackBars: 20 },
    market: "SP500",
    timeframe: "1h",
    datasetFrom: "2023-01-01T00:00:00.000Z",
    datasetTo: "2025-01-01T00:00:00.000Z",
    costs: { commissionPerFill: 0, slippagePct: 0.0005, halfSpread: 0.005 },
    executionMode: "MARKET",
  };
}

describe("fnv1a", () => {
  it("is deterministic", () => {
    expect(fnv1a("hello")).toBe(fnv1a("hello"));
  });

  it("differs for different inputs", () => {
    expect(fnv1a("hello")).not.toBe(fnv1a("hello!"));
  });
});

describe("canonicalJson", () => {
  it("is insensitive to key order", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("is sensitive to value differences", () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });

  it("canonicalizes nested objects", () => {
    expect(canonicalJson({ outer: { z: 1, a: 2 } })).toBe(canonicalJson({ outer: { a: 2, z: 1 } }));
  });
});

describe("buildExperimentId — reproducibility", () => {
  it("produces the same id for the same spec called twice", () => {
    const spec = baseSpec();
    expect(buildExperimentId(spec)).toBe(buildExperimentId(baseSpec()));
  });

  it("is insensitive to property insertion order within parameters", () => {
    const specA = baseSpec();
    const specB = { ...baseSpec(), parameters: { rocLookbackBars: 20 } };
    expect(buildExperimentId(specA)).toBe(buildExperimentId(specB));
  });
});

describe("buildExperimentId — parameter isolation", () => {
  it("changing a single parameter changes the id", () => {
    const specA = baseSpec();
    const specB = { ...baseSpec(), parameters: { rocLookbackBars: 40 } };
    expect(buildExperimentId(specA)).not.toBe(buildExperimentId(specB));
  });

  it("changing market changes the id, nothing else", () => {
    const specA = baseSpec();
    const specB = { ...baseSpec(), market: "NASDAQ100" as const };
    expect(buildExperimentId(specA)).not.toBe(buildExperimentId(specB));
  });

  it("changing timeframe changes the id", () => {
    const specA = baseSpec();
    const specB = { ...baseSpec(), timeframe: "30m" as const };
    expect(buildExperimentId(specA)).not.toBe(buildExperimentId(specB));
  });

  it("changing costs changes the id", () => {
    const specA = baseSpec();
    const specB = { ...baseSpec(), costs: { ...baseSpec().costs, slippagePct: 0.001 } };
    expect(buildExperimentId(specA)).not.toBe(buildExperimentId(specB));
  });

  it("changing executionMode changes the id", () => {
    const specA = baseSpec();
    const specB = { ...baseSpec(), executionMode: "LIMIT" as const };
    expect(buildExperimentId(specA)).not.toBe(buildExperimentId(specB));
  });

  it("changing the dataset window changes the id", () => {
    const specA = baseSpec();
    const specB = { ...baseSpec(), datasetTo: "2025-06-01T00:00:00.000Z" };
    expect(buildExperimentId(specA)).not.toBe(buildExperimentId(specB));
  });
});

describe("createExperimentRecord", () => {
  it("embeds the deterministic id and preserves the spec", () => {
    const spec = baseSpec();
    const record = createExperimentRecord(spec, { gitCommit: "abc123", classification: "REJECTED" });
    expect(record.id).toBe(buildExperimentId(spec));
    expect(record.strategyId).toBe(spec.strategyId);
    expect(record.gitCommit).toBe("abc123");
    expect(record.classification).toBe("REJECTED");
    expect(record.createdAt).toBeTruthy();
  });
});
