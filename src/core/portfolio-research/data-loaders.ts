import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Currency, DailyBar, FxInstrument, RateObservation } from "@/core/portfolio-research/types";

/** Reads the local caches written by `scripts/research/forex2/fetch-fx-daily.ts` and `fetch-macro-data.ts`. Node-only (fs) — never imported by client/browser code. */

const DATASETS_ROOT = join(process.cwd(), "results", "block8-2", "datasets");

function readJson<T>(path: string): T {
  if (!existsSync(path)) {
    throw new Error(`Missing Block 8.2 dataset at ${path}. Run the fetch scripts in scripts/research/forex2/ first.`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadDailyBars(instrument: FxInstrument): DailyBar[] {
  return readJson<DailyBar[]>(join(DATASETS_ROOT, "fx", `${instrument}_1d.json`));
}

export function loadRateSeries(currency: Currency): RateObservation[] {
  return readJson<RateObservation[]>(join(DATASETS_ROOT, "macro", "rates", `${currency}.json`));
}

export function loadCpiSeries(currency: Currency): RateObservation[] {
  return readJson<RateObservation[]>(join(DATASETS_ROOT, "macro", "cpi", `${currency}.json`));
}

/** Latest observation with `date <= asOf` — the causal lookup every signal in this module must use instead of ever reading a later observation. Assumes `series` is sorted ascending by date (true for both fetch scripts' output). */
export function latestObservationAsOf(series: readonly RateObservation[], asOf: string): RateObservation | undefined {
  let result: RateObservation | undefined;
  for (const obs of series) {
    if (obs.date > asOf) break;
    result = obs;
  }
  return result;
}
