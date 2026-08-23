import { describe, expect, it } from "vitest";
import { formatPct, formatReportValue, formatUsd, formatUsdPlain } from "@/novacore/reports/daily-close/format";
import { noData, notConnected, ok } from "@/novacore/reports/daily-close/types";

describe("formatReportValue", () => {
  it("formats an OK value with the given formatter", () => {
    expect(formatReportValue(ok(1234.5), formatUsdPlain)).toBe("$1,234.5");
  });
  it("renders NOT_CONNECTED distinctly from NO_DATA", () => {
    expect(formatReportValue(notConnected("x"), String)).toBe("No conectado");
    expect(formatReportValue(noData("x"), String)).toBe("Sin datos");
  });
});

describe("formatUsd / formatPct", () => {
  it("prefixes positive values with + and negative with -", () => {
    expect(formatUsd(120)).toBe("+$120");
    expect(formatUsd(-120)).toBe("-$120");
    expect(formatPct(1.5)).toBe("+1.50%");
    expect(formatPct(-1.5)).toBe("-1.50%");
  });
  it("treats exactly zero as positive-formatted (a confirmed zero, not a sign ambiguity)", () => {
    expect(formatUsd(0)).toBe("+$0");
    expect(formatPct(0)).toBe("+0.00%");
  });
});
