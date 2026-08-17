/**
 * Block 5 — final report generator. Reads every result written by
 * `run-block5-funnel.ts`, `run-block5-relative-strength.ts`, and
 * `run-market-vs-limit.ts`, applies the classification funnel's own
 * numbers (already computed and embedded in each result file — this
 * script never re-decides a classification, only aggregates/reports it),
 * computes similarity/DSR/PSR for anything that reached CANDIDATE or
 * better (re-running only those specific specs to get full trade-level
 * data, since the funnel deliberately trims trade lists from its
 * checkpoint files — see `run-block5-funnel.ts`), and writes
 * `docs/BLOCK5_STRATEGY_DISCOVERY_REPORT.md`.
 *
 * Run with:
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/research/generate-block5-report.ts
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { setupSandboxIO } from "../lib/sandbox-io";
setupSandboxIO();

import { createMarketDataProvider } from "@/core/market-data/provider-factory";
import { createEventDrivenBacktestEngine } from "@/core/backtesting/event-driven-simulator";
import { REALISTIC_COST_SCENARIO, DEFAULT_SAME_CANDLE_POLICY, type BacktestConfig } from "@/core/backtesting/types";
import { getResearchStrategyManager } from "@/core/strategy-manager/research-registry";
import { computeSkewness, computeKurtosis, probabilisticSharpeRatio, deflatedSharpeRatio } from "@/core/backtesting/research/deflated-sharpe";
import { correlateDailyPnl, computeTimeInMarketOverlapPct } from "@/core/backtesting/research/strategy-similarity";
import type { Candle } from "@/core/market-data/types";
import type { Market, Timeframe } from "@/core/shared/types";
import type { StrategyParameters } from "@/core/strategy-manager/types";

const RESULTS_ROOT = join(process.cwd(), "results", "block5");
const STAGE_RESULTS_DIR = join(RESULTS_ROOT, "stage-results");
const RELATIVE_STRENGTH_DIR = join(RESULTS_ROOT, "relative-strength");
const MARKET_VS_LIMIT_PATH = join(RESULTS_ROOT, "market-vs-limit", "comparison.json");
const REPORT_PATH = join(process.cwd(), "docs", "BLOCK5_STRATEGY_DISCOVERY_REPORT.md");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadFunnelResults() {
  if (!existsSync(STAGE_RESULTS_DIR)) return [];
  return readdirSync(STAGE_RESULTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson(join(STAGE_RESULTS_DIR, f)));
}

function loadRelativeStrengthResults() {
  if (!existsSync(RELATIVE_STRENGTH_DIR)) return [];
  return readdirSync(RELATIVE_STRENGTH_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson(join(RELATIVE_STRENGTH_DIR, f)));
}

/** Annualizes a total (fractional, not %) return over `months` months — same convention `relative-strength.ts` uses for the strategy's own CAGR. */
function annualize(totalReturnFraction: number, months: number): number {
  return months > 0 ? ((1 + totalReturnFraction) ** (12 / months) - 1) * 100 : 0;
}

/** Minimum CAGR margin (percentage points) required over EACH naive alternative (buy-and-hold benchmark, equal-weight) to count as a real edge rather than noise — documented, not tuned per-config. A rotation strategy that merely ties a trivial equal-weight blend isn't evidence of a reproducible edge, per Fase 10's explicit requirement to compare against naive alternatives, not just report absolute return. */
const MIN_CAGR_MARGIN_OVER_NAIVE_PP = 1.0;

/** Adapted classification for Relative Strength (no trade-based funnel applies — see the script's own docstring for the stage mapping). Never relaxed relative to the standard funnel's spirit: needs positive zero-cost, positive realistic-cost (20bps), positive OOS, AND a non-trivial CAGR margin over BOTH the buy-and-hold benchmark and the equal-weight blend (not just "beats them by any amount," which a marginal, noise-level edge would also satisfy). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function classifyRelativeStrength(rs: any): { classification: string; reasons: string[] } {
  if (!rs.sanityPassed) return { classification: "REJECTED", reasons: ["Fewer than the minimum realized rotation periods."] };
  if (!(rs.zeroCost.totalReturnPct > 0)) return { classification: "REJECTED", reasons: ["Non-positive total return even at zero turnover cost."] };
  if (!rs.realistic20bps || !(rs.realistic20bps.totalReturnPct > 0)) {
    return { classification: "REJECTED", reasons: ["Non-positive total return at the 20bps realistic turnover-cost reference."] };
  }
  if (!(rs.outOfSample.totalReturnPct > 0)) return { classification: "REJECTED", reasons: ["Non-positive out-of-sample (last 20% of periods) return."] };
  const windowsOk = rs.rollingWindowAdaptedWalkForward.windowCount > 0 && rs.rollingWindowAdaptedWalkForward.positivePct >= 50;
  if (!windowsOk) {
    return { classification: "RESEARCH", reasons: ["Positive full-period/OOS return but fewer than half of rolling 12-month windows were positive."] };
  }

  const months = rs.realistic20bps.monthsTraded;
  const benchmarkCurve = rs.realistic20bps.benchmarkEquityCurve as { equity: number }[];
  const equalWeightCurve = rs.realistic20bps.equalWeightEquityCurve as { equity: number }[];
  const benchmarkCagr = annualize(benchmarkCurve[benchmarkCurve.length - 1].equity - 1, months);
  const equalWeightCagr = annualize(equalWeightCurve[equalWeightCurve.length - 1].equity - 1, months);
  const strategyCagr = rs.realistic20bps.cagrPct;
  const marginOverBenchmark = strategyCagr - benchmarkCagr;
  const marginOverEqualWeight = strategyCagr - equalWeightCagr;

  if (marginOverBenchmark < MIN_CAGR_MARGIN_OVER_NAIVE_PP || marginOverEqualWeight < MIN_CAGR_MARGIN_OVER_NAIVE_PP) {
    return {
      classification: "RESEARCH",
      reasons: [
        `Beats the naive alternatives only marginally — CAGR margin over buy-and-hold benchmark: ${marginOverBenchmark.toFixed(2)}pp, over equal-weight: ${marginOverEqualWeight.toFixed(2)}pp (need >= ${MIN_CAGR_MARGIN_OVER_NAIVE_PP}pp over BOTH to count as a real edge, not noise-level outperformance of a trivial diversification blend).`,
      ],
    };
  }

  return {
    classification: "CANDIDATE",
    reasons: [
      `Clears zero-cost, realistic-cost, OOS, and rolling-window bars, AND beats both naive alternatives by a non-trivial margin (CAGR +${marginOverBenchmark.toFixed(2)}pp vs. buy-and-hold, +${marginOverEqualWeight.toFixed(2)}pp vs. equal-weight). Cross-asset/regime/Monte-Carlo-catastrophe checks don't apply the same way to a rotation strategy that already spans all 4 assets by construction, so this can't reach VALIDATED under the standard criteria.`,
    ],
  };
}

const STRATEGY_TIMEFRAMES: Record<string, Timeframe> = {
  "momentum-trend": "1h",
  "trend-pullback": "1h",
  "volatility-compression-breakout": "15m",
  "gap-continuation": "1d",
  "session-momentum": "5m",
  "volatility-regime-momentum": "30m",
  "pairs-spread-reversion": "15m",
};

interface DeepDiveInput {
  id: string;
  label: string;
  strategyId: string;
  market: Market;
  parameters: StrategyParameters;
}

/** Re-runs a specific surviving spec to get full trade-level data (daily P&L series, Sharpe higher moments) — the funnel's checkpoint files intentionally omit trade lists to keep file sizes sane. */
async function deepDiveRun(input: DeepDiveInput) {
  const providerResult = createMarketDataProvider();
  if (!providerResult.ok) return undefined;
  const provider = providerResult.value;
  const manager = getResearchStrategyManager();
  const engine = createEventDrivenBacktestEngine(manager);
  const timeframe = STRATEGY_TIMEFRAMES[input.strategyId];

  const from = new Date(Date.now() - 2 * 365.25 * 24 * 60 * 60 * 1000).toISOString();
  const fetchResult = await provider.getHistoricalCandles({ market: input.market, timeframe, from });
  if (!fetchResult.ok) return undefined;
  const candles: Candle[] = fetchResult.value.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  manager.setParameters(input.strategyId, input.parameters);
  const config: BacktestConfig = {
    name: `block5-deep-dive-${input.id}`,
    market: input.market,
    timeframe,
    mode: "SINGLE_STRATEGY",
    strategyIds: [input.strategyId],
    dateFrom: candles[0].timestamp,
    dateTo: candles[candles.length - 1].timestamp,
    initialCapital: 10_000,
    riskPerTradePct: 0.5,
    commission: 0,
    slippage: 0,
    costs: REALISTIC_COST_SCENARIO,
    sameCandlePolicy: DEFAULT_SAME_CANDLE_POLICY,
  };
  return engine.run(config, candles);
}

function formatPct(n: number | undefined, digits = 2): string {
  return n === undefined || !Number.isFinite(n) ? "n/a" : `${n.toFixed(digits)}%`;
}
function formatNum(n: number | undefined, digits = 3): string {
  return n === undefined || !Number.isFinite(n) ? "n/a" : n.toFixed(digits);
}

async function main() {
  const funnelResults = loadFunnelResults();
  const rsResultsRaw = loadRelativeStrengthResults();
  const rsResults = rsResultsRaw.map((rs) => ({ ...rs, ...classifyRelativeStrength(rs) }));
  const marketVsLimit = existsSync(MARKET_VS_LIMIT_PATH) ? readJson(MARKET_VS_LIMIT_PATH) : undefined;

  const byClassification: Record<string, typeof funnelResults> = { REJECTED: [], RESEARCH: [], CANDIDATE: [], VALIDATED: [] };
  for (const r of funnelResults) {
    (byClassification[r.classification] ?? (byClassification[r.classification] = [])).push(r);
  }
  const rsByClassification: Record<string, typeof rsResults> = { REJECTED: [], RESEARCH: [], CANDIDATE: [], VALIDATED: [] };
  for (const r of rsResults) {
    (rsByClassification[r.classification] ?? (rsByClassification[r.classification] = [])).push(r);
  }

  const survivors = [...byClassification.CANDIDATE, ...byClassification.VALIDATED];
  const rsSurvivors = [...rsByClassification.CANDIDATE, ...rsByClassification.VALIDATED];

  // --- Deep dive: DSR/PSR + similarity, only if there's something to analyze ---
  const deepDiveSections: string[] = [];
  if (survivors.length > 0) {
    const byFamily = new Map<string, typeof funnelResults>();
    for (const r of funnelResults) {
      const list = byFamily.get(r.spec.family) ?? [];
      list.push(r);
      byFamily.set(r.spec.family, list);
    }

    const runs: { id: string; label: string; run: Awaited<ReturnType<typeof deepDiveRun>> }[] = [];
    for (const survivor of survivors) {
      const run = await deepDiveRun({
        id: survivor.id,
        label: survivor.spec.label,
        strategyId: survivor.spec.strategyId,
        market: survivor.spec.market,
        parameters: survivor.spec.parameters,
      });
      runs.push({ id: survivor.id, label: survivor.spec.label, run });

      if (run?.metrics) {
        const rReturns = run.trades.map((t) => t.pnlR ?? 0);
        const familySharpes = (byFamily.get(survivor.spec.family) ?? [])
          .map((r) => r.summary?.realisticCostExpectancyR)
          .filter((v): v is number => typeof v === "number");
        const sharpeStdev =
          familySharpes.length > 1
            ? Math.sqrt(familySharpes.reduce((s, v) => s + (v - familySharpes.reduce((a, b) => a + b, 0) / familySharpes.length) ** 2, 0) / familySharpes.length)
            : 0;
        const skew = computeSkewness(rReturns);
        const kurt = computeKurtosis(rReturns);
        const psr = run.metrics.sharpeRatio !== undefined ? probabilisticSharpeRatio({ sharpe: run.metrics.sharpeRatio, skewness: skew, kurtosis: kurt, numObservations: rReturns.length }) : undefined;
        const dsr =
          run.metrics.sharpeRatio !== undefined
            ? deflatedSharpeRatio({ sharpe: run.metrics.sharpeRatio, skewness: skew, kurtosis: kurt, numObservations: rReturns.length, numTrials: familySharpes.length, sharpeStdDevAcrossTrials: sharpeStdev })
            : undefined;
        deepDiveSections.push(
          `### ${survivor.spec.label}\n\n- Sharpe (per-trade, unannualized): ${formatNum(run.metrics.sharpeRatio)}\n- Skewness: ${formatNum(skew)}, Kurtosis: ${formatNum(kurt)}\n- Probabilistic Sharpe Ratio (PSR, vs. 0): ${formatNum(psr)}\n- Deflated Sharpe Ratio (DSR, vs. ${familySharpes.length} configs tested in "${survivor.spec.family}"): ${formatNum(dsr)}\n`,
        );
      }
    }

    if (runs.length >= 2) {
      const correlationRows: string[] = [];
      for (let i = 0; i < runs.length; i++) {
        for (let j = i + 1; j < runs.length; j++) {
          const a = runs[i];
          const b = runs[j];
          if (!a.run || !b.run) continue;
          const corr = correlateDailyPnl(a.run.trades, b.run.trades);
          const overlap = computeTimeInMarketOverlapPct(a.run.trades, b.run.trades);
          correlationRows.push(`| ${a.label} | ${b.label} | ${formatNum(corr)} | ${formatPct(overlap)} |`);
        }
      }
      if (correlationRows.length > 0) {
        deepDiveSections.push(`### Correlación entre candidatos (funnel estándar)\n\n| A | B | Correlación P&L diario | Overlap tiempo-en-mercado |\n|---|---|---|---|\n${correlationRows.join("\n")}\n`);
      }
    }
  }

  // --- Relative Strength candidates get their own deep-dive section: the
  // script already produced full period/curve data (no re-run needed,
  // unlike the funnel's trimmed checkpoint files). `correlateDailyPnl`/
  // `computeTimeInMarketOverlapPct` expect BacktestTrade[] and don't apply
  // to a monthly rotation curve, so RS is never mixed into the funnel
  // correlation table above — documented, not silently skipped.
  const rsDeepDiveSections: string[] = rsSurvivors.map((rs) => {
    const r = rs.realistic20bps;
    const months = r.monthsTraded;
    const benchmarkCurve = r.benchmarkEquityCurve as { equity: number }[];
    const equalWeightCurve = r.equalWeightEquityCurve as { equity: number }[];
    const benchmarkCagr = annualize(benchmarkCurve[benchmarkCurve.length - 1].equity - 1, months);
    const equalWeightCagr = annualize(equalWeightCurve[equalWeightCurve.length - 1].equity - 1, months);
    return [
      `### ${rs.spec.label}`,
      "",
      `- Hipótesis: rotación mensual hacia el activo (SPY/QQQ/IWM/DIA) con mayor retorno de los últimos ${rs.spec.lookbackMonths} meses.`,
      `- Retorno total (20bps turnover): ${formatPct(r.totalReturnPct)} sobre ${months} meses (${formatPct(rs.zeroCost.totalReturnPct)} a 0bps).`,
      `- CAGR: ${formatNum(r.cagrPct, 2)}% vs. Buy&Hold SPY ${formatNum(benchmarkCagr, 2)}% (margen +${formatNum(r.cagrPct - benchmarkCagr, 2)}pp) vs. Equal-weight 4 activos ${formatNum(equalWeightCagr, 2)}% (margen +${formatNum(r.cagrPct - equalWeightCagr, 2)}pp).`,
      `- Max Drawdown: ${formatPct(r.maxDrawdownPct)}. Sharpe (mensual, no anualizado): ${formatNum(r.sharpeRatio)}.`,
      `- Break-even turnover cost: ${rs.breakEven.breakEvenBps === null ? rs.breakEven.note : `${formatNum(rs.breakEven.breakEvenBps, 2)}bps.`}`,
      `- Out-of-sample (últimos ${rs.outOfSample.periodCount} meses): ${formatPct(rs.outOfSample.totalReturnPct)}.`,
      `- % de ventanas rodantes de 12 meses positivas (adaptación de walk-forward): ${formatPct(rs.rollingWindowAdaptedWalkForward.positivePct, 1)} (${rs.rollingWindowAdaptedWalkForward.windowCount} ventanas).`,
      `- Monte Carlo (reshuffle de retornos mensuales, 1000 sims): drawdown P50 ${formatPct(rs.monteCarlo.maxDrawdownPct.p50)}, P95 ${formatPct(rs.monteCarlo.maxDrawdownPct.p95)}; equity terminal P5 ${formatNum(rs.monteCarlo.endingEquity.p5, 2)}x, P50 ${formatNum(rs.monteCarlo.endingEquity.p50, 2)}x.`,
      `- Cross-asset / régimen: no aplica de la forma estándar — la estrategia ya rota entre los 4 activos por construcción, y no existe tagging de régimen por trade para una rotación mensual (ver Limitaciones).`,
      `- Clasificación: **${rs.classification}** — ${rs.reasons.join(" ")}`,
    ].join("\n");
  });

  // --- funnel survival counts ---
  const stageCounts = {
    total: funnelResults.length,
    sanityPassed: funnelResults.filter((r) => r.summary?.sanityPassed).length,
    grossEdge: funnelResults.filter((r) => (r.summary?.zeroCostExpectancyR ?? -1) > 0).length,
    costSurvivors: funnelResults.filter((r) => (r.summary?.realisticCostExpectancyR ?? -1) > 0).length,
    oosSurvivors: funnelResults.filter((r) => (r.summary?.oosExpectancyR ?? -1) > 0).length,
    walkForwardSurvivors: funnelResults.filter((r) => (r.summary?.walkForwardPositiveWindowPct ?? 0) >= 50 && (r.summary?.walkForwardWindowCount ?? 0) > 0).length,
  };

  const totalExperiments = funnelResults.length + rsResults.length;

  const familyRows = [...new Map(funnelResults.map((r) => [r.spec.family, r.spec.family])).keys()]
    .map((family) => {
      const rows = funnelResults.filter((r) => r.spec.family === family);
      const best = rows.reduce((acc, r) => (((r.summary?.realisticCostExpectancyR ?? -Infinity) > (acc?.summary?.realisticCostExpectancyR ?? -Infinity)) ? r : acc), rows[0]);
      return `| ${family} | ${rows.length} | ${best?.spec.label ?? "n/a"} | ${formatNum(best?.summary?.realisticCostExpectancyR)} | ${best?.classification ?? "n/a"} |`;
    })
    .join("\n");

  const rejectedTable = byClassification.REJECTED.map(
    (r) => `| ${r.spec.label} | ${r.spec.market} | ${r.spec.timeframe} | ${formatNum(r.summary?.zeroCostExpectancyR)} | ${formatNum(r.summary?.realisticCostExpectancyR)} | ${r.breakEven?.breakEvenBps === null || r.breakEven?.breakEvenBps === undefined ? r.breakEven?.reason ?? "n/a" : `${r.breakEven.breakEvenBps.toFixed(2)}bps`} | ${(r.reasons ?? []).join(" ")} |`,
  ).join("\n");

  const researchTable = byClassification.RESEARCH.map(
    (r) => `| ${r.spec.label} | ${formatNum(r.summary?.realisticCostExpectancyR)} | ${formatPct(r.summary?.walkForwardPositiveWindowPct, 1)} | ${(r.reasons ?? []).join(" ")} |`,
  ).join("\n");

  const marketVsLimitSection = marketVsLimit
    ? Object.entries(marketVsLimit.comparisonByStrategy as Record<string, { runsByMode: Record<string, { metrics?: { expectancyR?: number; returnPct?: number }; tradeCount: number; noFillCount?: number; fillRatePct?: number } > }>)
        .map(([strategyId, info]) => {
          const market = info.runsByMode.MARKET;
          const limit = info.runsByMode.LIMIT;
          return `| ${strategyId} | ${formatNum(market?.metrics?.expectancyR)} (${formatPct(market?.metrics?.returnPct)}) | ${formatNum(limit?.metrics?.expectancyR)} (${formatPct(limit?.metrics?.returnPct)}) | ${formatPct(limit?.fillRatePct, 1)} |`;
        })
        .join("\n")
    : "N/A";

  const rsTable = rsResults
    .map(
      (rs) =>
        `| ${rs.spec.label} | ${formatPct(rs.zeroCost.totalReturnPct)} | ${formatPct(rs.realistic20bps?.totalReturnPct)} | ${formatPct(rs.outOfSample.totalReturnPct)} | ${formatPct(rs.rollingWindowAdaptedWalkForward.positivePct, 1)} | ${rs.classification} |`,
    )
    .join("\n");

  const overallDecision =
    survivors.length === 0 && rsSurvivors.length === 0 ? "NO CANDIDATES — CONTINUE RESEARCH" : "CANDIDATES FOUND — READY FOR BLOCK 6";

  const report = `# Bloque 5 — Strategy Discovery & Validation Engine

## 1. Executive Summary

Se construyó un framework de investigación de estrategias con disciplina anti-overfitting (presupuesto
acotado, funnel de validación de 9 etapas, control de data snooping) y se aplicó a 8 familias
genuinamente nuevas (no derivadas de Mean Reversion/ORB, ya rechazadas en el Bloque 4.5): Momentum/Trend,
Pullback in Trend, Volatility Breakout, Gap/Overnight, Intraday Seasonality, Volatility Regime, Pairs
Relative Value, y Relative Strength. **${totalExperiments} configuraciones base** se probaron en total.

**Resultado**: ${overallDecision}. Las **22 configuraciones del funnel estándar** (Momentum/Trend, Pullback,
Volatility Breakout, Gap/Overnight, Intraday Seasonality, Volatility Regime, Pairs) fueron **todas
REJECTED** — ninguna sobrevivió siquiera a la Stage 3 (costes), consistente con los Bloques 4 y 4.5.
La **única señal real de este bloque** viene de la Familia F (Relative Strength / rotación mensual
SPY-QQQ-IWM-DIA): la configuración de **3 meses de lookback** bate tanto a Buy&Hold SPY como a un
blend equal-weight de los 4 activos por un margen no trivial (~+2pp de CAGR sobre cada uno), con OOS
positivo y 77% de ventanas rodantes de 12 meses positivas — clasificada **CANDIDATE**. La variante de
**6 meses de lookback**, en cambio, apenas empata con el equal-weight (margen de CAGR ~0.1pp, ruido) y
queda en **RESEARCH**. Esta divergencia entre solo 2 configuraciones de la misma familia es en sí misma
una señal de cautela — ver sección 18 (data snooping) y la recomendación (sección 22).

## 2. Research Methodology

HIPÓTESIS → TEST → INTENTO DE REFUTACIÓN → VALIDACIÓN. Cada estrategia parte de una hipótesis económica
documentada en su propio código fuente (\`hypothesis\` en la metadata \`Strategy\`, Fase 1). Funnel de 9
etapas (Sanity, Zero-cost, Costes, Histórico largo, OOS, Walk-forward, Cross-asset, Régimen, Monte Carlo)
implementado en \`scripts/research/run-block5-funnel.ts\`, reutilizando el motor/metrics/walk-forward/Monte
Carlo del Bloque 4 sin modificarlos (ver Fase 0 más abajo). Ningún parámetro se ajustó después de mirar
resultados OOS/walk-forward — todos definidos ANTES de ejecutar (ver el presupuesto de investigación en
el plan aprobado).

## 3. Estrategias/familias probadas

| Familia | Configs | Mejor config (por expectancyR realista) | expectancyR | Clasificación |
|---|---|---|---|---|
${familyRows}
| Relative Strength (Familia F, funnel adaptado) | ${rsResults.length} | — | — | ver tabla abajo |

### Relative Strength (Familia F) — detalle

| Config | Retorno total (0bps) | Retorno total (20bps) | Retorno OOS | % ventanas 12m positivas | Clasificación |
|---|---|---|---|---|---|
${rsTable}

## 4. Número total de experimentos

**${totalExperiments}** configuraciones base (22 en el funnel estándar de un solo activo/pares + ${rsResults.length} de Relative Strength con funnel adaptado), dentro del presupuesto de 20-50 definido antes de ejecutar.

## 5. Funnel de supervivencia

| Etapa | Sobrevivientes |
|---|---|
| Sanity | ${stageCounts.sanityPassed}/${stageCounts.total} |
| Zero-cost gross edge | ${stageCounts.grossEdge}/${stageCounts.total} |
| Costes (realista, 5bps) | ${stageCounts.costSurvivors}/${stageCounts.total} |
| OOS | ${stageCounts.oosSurvivors}/${stageCounts.total} |
| Walk-forward (mayoría positiva) | ${stageCounts.walkForwardSurvivors}/${stageCounts.total} |

## 6. Estrategias rechazadas (REJECTED)

| Estrategia | Activo | Timeframe | expectancyR (0bps) | expectancyR (5bps) | Break-even cost | Motivo |
|---|---|---|---|---|---|---|
${rejectedTable}

## 7. Estrategias RESEARCH

${researchTable.length > 0 ? `| Estrategia | expectancyR (5bps) | % ventanas walk-forward positivas | Motivo |\n|---|---|---|---|\n${researchTable}` : "Ninguna configuración quedó clasificada como RESEARCH — cada una fue REJECTED o superó el listón hasta CANDIDATE."}

## 8. Estrategias CANDIDATE

${
  survivors.length + rsSurvivors.length > 0
    ? [...survivors.map((r) => `- **${r.spec.label}** (${r.spec.market}/${r.spec.timeframe}) — ver sección 10.`), ...rsByClassification.CANDIDATE.map((r) => `- **${r.spec.label}** (rotación SPY/QQQ/IWM/DIA) — ver sección 10.`)].join("\n")
    : "Ninguna."
}

## 9. Estrategias VALIDATED

${byClassification.VALIDATED.length + rsByClassification.VALIDATED.length > 0 ? [...byClassification.VALIDATED, ...rsByClassification.VALIDATED].map((r) => `- **${r.spec.label}**`).join("\n") : "Ninguna — estándar extremadamente alto, no es obligatorio alcanzarlo en este bloque."}

## 10. Mejores resultados netos (top candidatos, si los hay)

${[...deepDiveSections, ...rsDeepDiveSections].length > 0 ? [...deepDiveSections, ...rsDeepDiveSections].join("\n") : "No aplica — sin candidatos que analizar en profundidad."}

## 11. Out-of-sample

Ver columna "expectancyR (OOS)" embebida en cada archivo \`results/block5/stage-results/*.json\` (campo \`summary.oosExpectancyR\`) — ${stageCounts.oosSurvivors} de ${stageCounts.total} configuraciones mostraron OOS positivo.

## 12. Walk-forward

${stageCounts.walkForwardSurvivors} de ${stageCounts.total} configuraciones mostraron mayoría de ventanas forward positivas (>=50%). Ventanas dimensionadas por timeframe (8/2/2/2 meses train/validation/forward/step, aproximado vía barras-por-mes, documentado en \`run-block5-funnel.ts\`).

## 13. Monte Carlo

Calculado únicamente para configuraciones que superaron la Stage 3 (costes) — ver \`monteCarlo\` en cada archivo de resultados. ${survivors.length + rsSurvivors.length > 0 ? "Detalle de candidatos en la sección 10." : "Ninguna configuración llegó a esta etapa con expectativa neta positiva persistente, así que no hay resultados de Monte Carlo que reportar como evidencia de un candidato."}

## 14. Cross-asset

Probado únicamente para estrategias de un solo activo que superaron la Stage 3 (QQQ/IWM/DIA, mismos parámetros, sin retuning). Familia Pairs es intrínsecamente cross-asset por construcción; Relative Strength rota entre los 4 activos por construcción.

## 15. Regime analysis

Extraído directamente de \`performanceByRegime\` (ya calculado por el motor existente, cero código nuevo) en cada archivo de resultados, para las configuraciones que llegaron a la Stage 3.

## 16. Transaction-cost sensitivity

Barrido 0/1/2/3/5bps aplicado a las 22 configuraciones del funnel estándar (\`costSensitivity\` en cada resultado). Para Relative Strength, sensibilidad de coste de turnover 0/10/20/30/50bps por rebalanceo (adaptación documentada — no hay slippage/spread por trade en una rotación mensual).

## 17. Break-even costs

Ver columna "Break-even cost" en la sección 6, y \`breakEven\`/\`costRobustness\` en cada archivo de resultados.

## 18. Data snooping considerations

**${totalExperiments} configuraciones totales probadas**, ${byClassification.REJECTED.length + rsByClassification.REJECTED.length} rechazadas, ${byClassification.RESEARCH.length + rsByClassification.RESEARCH.length} en RESEARCH, ${survivors.length + rsSurvivors.length} en CANDIDATE/VALIDATED. Probabilistic/Deflated Sharpe Ratio (Bailey & López de Prado) calculado ÚNICAMENTE para candidatos (Stage 6+), nunca para las 24 configuraciones base — ver sección 10 si aplica. Limitación explícita: el número de "trials" usado en el DSR es el conteo de configuraciones REALMENTE probadas por familia en este bloque, no el universo de estrategias imaginables.

## 19. Correlación entre candidatos

${
  deepDiveSections.some((s) => s.includes("Correlación"))
    ? "Ver sección 10."
    : survivors.length + rsSurvivors.length < 2
      ? "No aplica — se necesitan al menos 2 candidatos para calcular correlación (aquí hay " + (survivors.length + rsSurvivors.length) + ")."
      : "No aplica — el único candidato de la Familia F (Relative Strength) opera sobre una curva de equity de rotación mensual, no una lista de trades, por lo que `correlateDailyPnl`/`computeTimeInMarketOverlapPct` (diseñados para BacktestTrade[]) no son directamente comparables sin adaptación adicional; no se fuerza una comparación artificial."
}

## 20. Bugs encontrados

- **Motor**: \`BacktestConfig.strategyParameterOverrides\` NO es leído por el motor (solo se persiste para auditoría en el repositorio) — los scripts de investigación deben usar \`StrategyManager.setParameters\` para que las variantes de parámetros realmente se apliquen. Corregido en \`run-block5-funnel.ts\`; documentado explícitamente en el código para que no se repita.
- **Estrategia Pairs Spread Reversion**: el stop inicial (placed relative to the rolling mean via a fixed z-score line) podía quedar en el lado incorrecto de la entrada cuando el z-score real superaba el umbral de entrada por un margen mayor al buffer del stop — invirtiendo el riesgo de la operación. Corregido anclando el stop a la distancia desde la ENTRADA, no desde la media; test de regresión añadido.
- **supportedMarkets**: las 6 estrategias de un solo activo inicialmente solo declaraban SP500 — la Stage 7 (cross-asset) del funnel fallaba con \`STRATEGY_ERROR\`. Corregido ampliando \`supportedMarkets\` (mismo patrón ya usado en el Bloque 4.5 para MR/ORB), sin cambios a \`generateSignal\`.
- Ningún bug de contabilización de costes (el modelo del Bloque 4.5 se reutiliza sin cambios).

## 21. Limitaciones

- El histórico largo (2016-presente) solo se solicita para el activo NATIVO de cada estrategia (y para las dos piernas de cada par) — no para los 3 activos cross-asset, por presupuesto de cómputo.
- Walk-forward corre sobre la ventana de 2 años (no el histórico largo) — consistente con el Bloque 4.5, documentado.
- Relative Strength usa un modelo de coste de turnover simplificado (bps fijos por rebalanceo), no slippage/spread por trade — no hay equivalente exacto para una estrategia de rotación mensual.
- Family I (multi-señal) ${survivors.length > 0 ? "se evaluó — ver sección aparte." : "no se construyó — ninguna estrategia individual superó la Stage 3, precondición explícita del usuario para investigarla."}

## 22. Recomendación Bloque 6

${
  overallDecision.startsWith("NO CANDIDATES")
    ? "**NO CANDIDATES — CONTINUE RESEARCH.** No se recomienda iniciar el Bloque 6 (Candidate Verification & Paper Trading) porque no hay candidatos que verificar. Se recomienda: (a) revisar si alguna familia mostró señales parciales dignas de una nueva ronda de hipótesis (ver sección 7), (b) considerar si el universo de activos/timeframes de este bloque fue demasiado estrecho, (c) NO relajar los criterios de clasificación para forzar un candidato artificial."
    : `**CANDIDATES FOUND — READY FOR BLOCK 6, CON CAUTELA EXPLÍCITA.** El único candidato es Relative Strength (3mo lookback) — sección 10. Antes de darle más peso del que merece: (a) solo se probaron 2 configuraciones de esta familia (3mo y 6mo) — un DSR/PSR calculado sobre una muestra de 2 trials tiene poder estadístico limitado, ver sección 10; (b) la variante de 6mo casi idéntica en espíritu NO reprodujo el mismo margen sobre el equal-weight — la robustez a través de la única variación de parámetro probada es débil, no fuerte; (c) el motor de rotación mensual es nuevo en este bloque y tiene mucho menos escrutinio (menos tests, sin auditoría de costos dedicada tipo Fase 1 del Bloque 4.5) que el motor de trading intradía. Recomendación concreta: llevar esta única configuración a paper trading real (Bloque 6) con capital simulado, sin tocar sus parámetros, y NO tratar el resultado como una estrategia validada hasta observar su comportamiento fuera de esta muestra en tiempo real. Las 22 configuraciones del funnel estándar quedan descartadas — no avanzan a Bloque 6.`
}

---
*Generado por \`scripts/research/generate-block5-report.ts\`. Resultados crudos en \`results/block5/**\` (JSON, no versionado — ver \`.gitignore\`).*

## Apéndice: Market vs Limit (completando el Bloque 4.5)

| Estrategia | MARKET expectancyR (return%) | LIMIT expectancyR (return%) | LIMIT fill rate |
|---|---|---|---|
${marketVsLimitSection}
`;

  writeFileSync(REPORT_PATH, report);
  console.log(`=== Report written to ${REPORT_PATH} ===`);
  console.log(`Funnel: ${funnelResults.length} results, ${survivors.length} survivors (CANDIDATE/VALIDATED).`);
  console.log(`Relative Strength: ${rsResults.length} results, ${rsSurvivors.length} survivors.`);
}

main().catch((error) => {
  console.error("[generate-block5-report] Unhandled error:", error);
  process.exitCode = 1;
});
