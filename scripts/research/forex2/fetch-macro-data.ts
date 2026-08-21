/**
 * Block 8.2 — fetches central bank policy/interbank rates (for the
 * Carry family, §3.3 of the report) and CPI (for the PPP-based Value
 * definition, §3.4) for all 8 currencies from FRED's plain CSV export
 * (no API key needed — tested and confirmed reachable during the data
 * audit). This is real, OBSERVED, reported data — not an estimate.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/forex2/fetch-macro-data.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../../lib/sandbox-io";
setupSandboxIO();

const OUTPUT_DIR = join(process.cwd(), "results", "block8-2", "datasets", "macro");

/** 3-month interbank rate (OECD MEI), monthly — same rate CONCEPT for every currency, verified reachable in the data audit (§3.3). */
const RATE_SERIES: Record<string, string> = {
  USD: "IR3TIB01USM156N",
  EUR: "IR3TIB01EZM156N",
  GBP: "IR3TIB01GBM156N",
  JPY: "IR3TIB01JPM156N",
  AUD: "IR3TIB01AUM156N",
  CAD: "IR3TIB01CAM156N",
  CHF: "IR3TIB01CHM156N",
  NZD: "IR3TIB01NZM156N",
};

/** CPI, all-items — AUD/NZD are quarterly, the rest monthly (§3.4). */
const CPI_SERIES: Record<string, string> = {
  USD: "CPIAUCSL",
  EUR: "CP0000EZ19M086NEST",
  GBP: "GBRCPIALLMINMEI",
  JPY: "JPNCPIALLMINMEI",
  AUD: "AUSCPIALLQINMEI",
  CAD: "CANCPIALLMINMEI",
  CHF: "CHECPIALLMINMEI",
  NZD: "NZLCPIALLQINMEI",
};

interface Observation {
  date: string;
  value: number;
}

async function fetchFredSeries(seriesId: string): Promise<Observation[]> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  const response = await fetch(url);
  if (response.status !== 200) {
    throw new Error(`FRED fetch failed for ${seriesId}: HTTP ${response.status}`);
  }
  const text = await response.text();
  const lines = text.trim().split("\n").slice(1); // drop header
  const observations: Observation[] = [];
  for (const line of lines) {
    const [date, valueStr] = line.split(",");
    const value = Number(valueStr);
    if (date && Number.isFinite(value)) observations.push({ date, value });
  }
  return observations;
}

async function main(): Promise<void> {
  mkdirSync(join(OUTPUT_DIR, "rates"), { recursive: true });
  mkdirSync(join(OUTPUT_DIR, "cpi"), { recursive: true });
  const report: Record<string, unknown> = {};

  for (const [ccy, seriesId] of Object.entries(RATE_SERIES)) {
    console.log(`[Block 8.2] Fetching rate series ${ccy} (${seriesId}) ...`);
    const obs = await fetchFredSeries(seriesId);
    writeFileSync(join(OUTPUT_DIR, "rates", `${ccy}.json`), JSON.stringify(obs));
    report[`rate_${ccy}`] = { seriesId, observations: obs.length, from: obs[0]?.date, to: obs[obs.length - 1]?.date };
  }

  for (const [ccy, seriesId] of Object.entries(CPI_SERIES)) {
    console.log(`[Block 8.2] Fetching CPI series ${ccy} (${seriesId}) ...`);
    const obs = await fetchFredSeries(seriesId);
    writeFileSync(join(OUTPUT_DIR, "cpi", `${ccy}.json`), JSON.stringify(obs));
    report[`cpi_${ccy}`] = { seriesId, observations: obs.length, from: obs[0]?.date, to: obs[obs.length - 1]?.date };
  }

  writeFileSync(join(OUTPUT_DIR, "_fetch-report.json"), JSON.stringify(report, null, 2));
  console.log("[Block 8.2] Done.");
}

main().catch((error) => {
  console.error("[Block 8.2] fetch-macro-data failed:", error);
  process.exitCode = 1;
});
