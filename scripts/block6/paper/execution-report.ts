/**
 * Block 6, forward-testing — generates a human-readable Markdown report
 * for ONE decision month's real (paper) execution, built entirely from
 * the forward-evidence ledger row (`forward-evidence-store.ts`). Ready to
 * run the moment the first real execution happens — as of this commit,
 * zero real orders have been submitted, so this has never produced a
 * report against real data yet; it exists so nothing is improvised later.
 *
 * `buildExecutionReportMarkdown` is a pure function (no I/O) so it's
 * directly unit-testable with a synthetic `ForwardEvidenceRecord`; `main()`
 * is the thin I/O wrapper that reads the ledger and writes the file.
 *
 * Deliberately does NOT compute a "slippage" number when no external
 * reference execution price is available — inventing one would be worse
 * than reporting none. When a reference IS available (e.g. from
 * `backtest-vs-paper.ts#reconcileRebalance`), pass it via
 * `referenceExecutionPriceBySymbol`.
 *
 * Run with:
 *   npx tsx scripts/block6/paper/execution-report.ts <decisionMonth>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ForwardEvidenceRecord } from "@/core/paper-trading/rs3m/forward-evidence";
import { readForwardEvidenceLedger } from "./forward-evidence-store";

function fmt(value: number | undefined, digits = 2): string {
  return value === undefined ? "n/a" : value.toFixed(digits);
}

export interface ExecutionReportOptions {
  /** Optional external reference execution price per symbol (e.g. the theoretical next-open price RS3M_CANDIDATE_V1's execution convention assumes). Slippage is only ever reported when this is provided — see the module doc comment. */
  referenceExecutionPriceBySymbol?: Record<string, number>;
}

export function buildExecutionReportMarkdown(record: ForwardEvidenceRecord, options: ExecutionReportOptions = {}): string {
  const lines: string[] = [];
  const refs = options.referenceExecutionPriceBySymbol ?? {};

  lines.push(`# RS3M_CANDIDATE_V1 — Informe de ejecución Paper: ${record.decisionMonth ?? "?"}`);
  lines.push("");
  lines.push(`**Mode:** ${record.mode} · **Estado final:** ${record.finalState} · **Candidate hash:** \`${record.candidateHash}\``);
  lines.push(`**Timestamp del registro:** ${record.timestamp} · **Data cutoff de la señal:** ${record.dataCutoff ?? "n/a"}`);
  lines.push("");

  lines.push("## Señal y ranking");
  lines.push("");
  lines.push("| Mercado | Retorno trailing % |");
  lines.push("|---|---|");
  for (const r of record.ranking) lines.push(`| ${r.market} | ${fmt(r.trailingReturnPct)} |`);
  lines.push("");
  lines.push(`**Ganador:** ${record.winner ?? "CASH"} · **Activo objetivo:** ${record.targetAsset ?? "CASH"}`);
  lines.push("");

  lines.push("## Órdenes solicitadas vs. enviadas");
  lines.push("");
  lines.push("### Propuestas por el plan");
  lines.push("| Symbol | Side | Notional USD | Motivo |");
  lines.push("|---|---|---|---|");
  for (const o of record.proposedOrders) lines.push(`| ${o.symbol} | ${o.side} | ${fmt(o.notionalUsd)} | ${o.reason} |`);
  lines.push("");
  lines.push("### Enviadas / estado en el broker (aceptadas, rechazadas, fills, parciales)");
  lines.push("| Order ID | Symbol | Side | Status | Notional | Filled Qty | Avg Fill Price | Filled At | Slippage vs. referencia |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const o of record.submittedOrders) {
    const ref = refs[o.symbol];
    const slippagePct = ref !== undefined && o.filledAvgPrice !== undefined && ref !== 0 ? (((o.filledAvgPrice - ref) / ref) * 100).toFixed(3) + "%" : "sin precio de referencia";
    lines.push(`| ${o.orderId} | ${o.symbol} | ${o.side} | ${o.status} | ${fmt(o.notionalUsd)} | ${fmt(o.filledQty, 4)} | ${fmt(o.filledAvgPrice)} | ${o.filledAt ?? "n/a"} | ${slippagePct} |`);
  }
  if (record.submittedOrders.length === 0) lines.push("| _(ninguna orden fue enviada)_ | | | | | | | | |");
  lines.push("");

  lines.push("## Posiciones y equity");
  lines.push("");
  lines.push(`- Equity ANTES: $${fmt(record.accountEquityUsd)}`);
  lines.push(`- Equity DESPUÉS: $${fmt(record.accountEquityAfterUsd)}`);
  lines.push("- Posiciones ANTES: " + (record.positionsBefore?.length ? record.positionsBefore.map((p) => `${p.symbol}=$${fmt(p.marketValue)}`).join(", ") : "(ninguna)"));
  lines.push("- Posiciones DESPUÉS: " + (record.positionsAfter?.length ? record.positionsAfter.map((p) => `${p.symbol}=$${fmt(p.marketValue)}`).join(", ") : "(sin datos o sin posiciones)"));
  const targetHeldAfter = record.positionsAfter?.find((p) => p.symbol === record.targetAsset);
  lines.push(`- Diferencia target vs. posición real: objetivo=${record.targetAsset ?? "CASH"}, mantenido después=${targetHeldAfter ? `${targetHeldAfter.symbol} ($${fmt(targetHeldAfter.marketValue)})` : "no confirmado en el snapshot de posiciones-después"}.`);
  lines.push("");

  lines.push("## Turnover, costes y fills parciales");
  lines.push("");
  lines.push(`- Turnover estimado: ${fmt(record.estimatedTurnoverPct)}%`);
  lines.push(`- Coste de referencia (RS3M_CANDIDATE_V1): ${record.referenceRebalanceCostBps}bps`);
  lines.push(`- ¿Alguna orden seguía abierta/parcial al cierre del registro? ${record.anyOrderStillInFlight === undefined ? "n/a" : record.anyOrderStillInFlight ? "SÍ — revisar manualmente" : "No"}`);
  lines.push("");

  lines.push("## Errores del broker / motivo de skip");
  lines.push("");
  lines.push(record.skipReason ? `⚠️ ${record.skipReason}` : "Ninguno registrado.");
  lines.push("");

  lines.push("## Resultado de los safety guards en este intento");
  lines.push("");
  if (record.guardViolations.length === 0) {
    lines.push("Todos los guards pasaron.");
  } else {
    lines.push("| Guard | Motivo |");
    lines.push("|---|---|");
    for (const v of record.guardViolations) lines.push(`| ${v.guard} | ${v.reason} |`);
  }
  lines.push("");
  lines.push("---");
  lines.push("_Generado a partir de `results/block6/forward/ledger.jsonl` — nunca mezclado retroactivamente con el dataset de backtest/OOS que justificó el candidato. El slippage solo se calcula cuando se provee un precio de referencia externo; su ausencia no es un error, es honestidad metodológica._");

  return lines.join("\n");
}

function main() {
  const decisionMonth = process.argv[2];
  if (!decisionMonth || !/^\d{4}-\d{2}$/.test(decisionMonth)) {
    console.error("[execution-report] Usage: npx tsx scripts/block6/paper/execution-report.ts <YYYY-MM>");
    process.exitCode = 1;
    return;
  }

  const executedRecords = readForwardEvidenceLedger().filter((r) => r.decisionMonth === decisionMonth && r.finalState === "EXECUTED");
  if (executedRecords.length === 0) {
    console.error(`[execution-report] No EXECUTED record found for ${decisionMonth} in results/block6/forward/ledger.jsonl — nothing to report yet.`);
    process.exitCode = 1;
    return;
  }

  const record = executedRecords[executedRecords.length - 1];
  const markdown = buildExecutionReportMarkdown(record);

  const outDir = join(process.cwd(), "results", "block6", "forward", "reports");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${decisionMonth}-execution-report.md`);
  writeFileSync(outPath, markdown);
  console.log(`=== Execution report written to ${outPath} ===`);
}

main();
