import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { currentStatus, type Rs3mStatus, type StatusTransition } from "@/core/paper-trading/rs3m/status";

/**
 * Block 7 — READ-ONLY reader for RS3M_CANDIDATE_V1's persisted status
 * history at `results/block6/candidate/rs3m-v1-status.json` (written
 * exclusively by `scripts/block6/write-status.ts`, which this module does
 * NOT import or call). This file is gitignored (`/results/` in
 * `.gitignore`) and machine/environment-specific — it may or may not
 * exist in any given checkout.
 *
 * NovaCore never assumes a status: if the file is absent (as it is in a
 * fresh checkout that hasn't run the Block 6 scripts), `readRs3mStatusFile`
 * returns `undefined` and callers must say so honestly rather than
 * guessing or defaulting to a specific `Rs3mStatus`.
 */

const STATUS_PATH = join(process.cwd(), "results", "block6", "candidate", "rs3m-v1-status.json");

export interface Rs3mStatusFile {
  candidateId: string;
  candidateHash: string;
  history: StatusTransition[];
}

export function readRs3mStatusFile(): Rs3mStatusFile | undefined {
  if (!existsSync(STATUS_PATH)) return undefined;
  try {
    return JSON.parse(readFileSync(STATUS_PATH, "utf8")) as Rs3mStatusFile;
  } catch {
    return undefined;
  }
}

export function readRs3mCurrentStatus(): Rs3mStatus | undefined {
  const file = readRs3mStatusFile();
  if (!file) return undefined;
  return currentStatus(file.history);
}
