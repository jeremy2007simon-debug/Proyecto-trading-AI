import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FX_TOP5_FAMILY_SUMMARIES, R3B_VERIFICATION, US_INDEX_TOP5_FAMILY_SUMMARIES, listResearchProjects } from "@/novacore/research-lab/adapters/block-research-adapter";
import {
  CUMULATIVE_TRIAL_LEDGER_SUMMARY,
  LITERATURE_FAMILIES_REVIEWED_COUNT,
  STRATEGY2_BACKTEST_OUTCOMES,
  STRATEGY2_CANDIDATES,
  STRATEGY2_TOP5_FAMILIES,
} from "@/novacore/research-lab/adapters/block9-strategy2-discovery-adapter";

const DATA_FEASIBILITY_CLASS: Record<string, string> = {
  READY: "text-buy",
  PARTIAL: "text-wait",
  UNAVAILABLE: "text-sell",
};

const CANDIDATE_STATUS_CLASS: Record<string, string> = {
  REJECTED: "text-sell",
  RESEARCH: "text-wait",
  CANDIDATE: "text-buy",
  DATA_INSUFFICIENT: "text-muted-foreground",
};

export default function NovaCoreResearchPage() {
  const projects = listResearchProjects();

  return (
    <div>
      <PageHeader title="Research Lab" description="Resúmenes sobre el motor de investigación existente (Bloques 4-5). Las cifras están transcritas de los informes congelados, nunca recalculadas." />

      <div className="mb-6 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-xs text-accent">
        <strong>Investigación ≠ Trading.</strong> Nada de esta pantalla opera capital real ni Paper — es el laboratorio donde nacieron y murieron
        hipótesis antes de que RS3M existiera como candidato.
      </div>

      <div className="space-y-6">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardHeader title={project.name} description={project.objective} />
            <CardBody className="p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Hipótesis" value={project.hypothesesTotal} />
                <StatTile label="Rechazadas" value={project.rejected} valueClassName="text-sell" />
                <StatTile label="En investigación" value={project.research} valueClassName="text-wait" />
                <StatTile label="Candidatas" value={project.candidates} valueClassName="text-buy" />
              </div>
              <p className="mt-4 text-xs text-muted">{project.notes}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                {project.constraints.map((c) => (
                  <span key={c} className="rounded-full border border-border-subtle px-2 py-0.5">
                    {c}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">Fuente: {project.sourceDoc}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">FX Research — desglose por familia (Block 8.2)</h2>
        <p className="mb-4 text-xs text-muted">
          Solo investigación. Ninguna familia está conectada a ejecución — <code>CANDIDATE</code> nunca implica <code>PAPER_READY</code>.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FX_TOP5_FAMILY_SUMMARIES.map((fam) => (
            <Card key={fam.family}>
              <CardHeader title={fam.family} description={fam.status === "DATA_INSUFFICIENT" ? "Sin datos suficientes — no ejecutada" : `${fam.experiments} experimentos`} />
              <CardBody className="p-4">
                <div className={`mb-2 inline-block rounded-full border border-border-subtle px-2 py-0.5 text-[11px] font-medium ${CANDIDATE_STATUS_CLASS[fam.candidateStatus]}`}>
                  {fam.candidateStatus}
                </div>
                {fam.status === "COMPLETE" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <StatTile label="Mejor bruto/año" value={fam.bestGrossAnnualized !== null ? `${(fam.bestGrossAnnualized * 100).toFixed(1)}%` : "—"} />
                      <StatTile label="Mejor neto/año" value={fam.bestNetAnnualized !== null ? `${(fam.bestNetAnnualized * 100).toFixed(1)}%` : "—"} />
                    </div>
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      <strong>OOS:</strong> {fam.oosNote}
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      <strong>Robustez:</strong> {fam.robustnessNote}
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      <strong>Costes:</strong> {fam.costSensitivityNote}
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Requiere datos macro point-in-time (vintage) que este entorno no puede verificar sin API key — ver §3.5 del informe.
                  </p>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">US Index Research — desglose por familia (Block 8.3)</h2>
        <p className="mb-4 text-xs text-muted">
          Solo investigación. Cada candidata mecánica fue además contrastada contra Deflated Sharpe Ratio y correlación vs RS3M_CANDIDATE_V1 (benchmark, nunca reutilizado como lógica) — <code>CANDIDATE</code> nunca implica <code>PAPER_READY</code>.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {US_INDEX_TOP5_FAMILY_SUMMARIES.map((fam) => (
            <Card key={fam.family}>
              <CardHeader title={fam.family} description={fam.status === "DATA_INSUFFICIENT" ? "Datos insuficientes (muestra por debajo del mínimo)" : `${fam.experiments} experimentos`} />
              <CardBody className="p-4">
                <div className={`mb-2 inline-block rounded-full border border-border-subtle px-2 py-0.5 text-[11px] font-medium ${CANDIDATE_STATUS_CLASS[fam.candidateStatus]}`}>
                  {fam.candidateStatus}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <StatTile label="Mejor bruto/año" value={fam.bestGrossAnnualizedPct !== null ? `${fam.bestGrossAnnualizedPct.toFixed(1)}%` : "—"} />
                  <StatTile label="Mejor neto/año" value={fam.bestNetAnnualizedPct !== null ? `${fam.bestNetAnnualizedPct.toFixed(1)}%` : "—"} />
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  <strong>OOS/WF:</strong> {fam.oosNote}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  <strong>MaxDD/Robustez:</strong> {fam.maxDrawdownNote}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  <strong>Costes:</strong> {fam.costMarginNote}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  <strong>Correlación vs RS3M:</strong> {fam.correlationVsRs3mNote}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Verificación independiente de candidatos (Block 8.4)</h2>
        <p className="mb-4 text-xs text-muted">
          Auditoría falsacionista, no optimización — reproducción independiente, no-lookahead adversarial, sensibilidad de parámetros y DSR bajo el pool completo de investigación acumulada.{" "}
          <code>VERIFIED_CANDIDATE</code> nunca implica <code>PAPER_READY</code>.
        </p>
        <Card>
          <CardHeader title={R3B_VERIFICATION.candidateId} description={R3B_VERIFICATION.sourceProject} />
          <CardBody className="p-4">
            <div className={`mb-2 inline-block rounded-full border border-border-subtle px-2 py-0.5 text-[11px] font-medium ${CANDIDATE_STATUS_CLASS[R3B_VERIFICATION.verificationStatus === "VERIFIED_CANDIDATE" ? "CANDIDATE" : "REJECTED"]}`}>
              {R3B_VERIFICATION.verificationStatus}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <StatTile label="Net CAGR" value={`${R3B_VERIFICATION.netCagrPct.toFixed(2)}%`} />
              <StatTile label="MaxDD" value={`${R3B_VERIFICATION.maxDrawdownPct.toFixed(2)}%`} />
              <StatTile label="Correlación vs RS3M" value={R3B_VERIFICATION.correlationVsRs3m.toFixed(2)} />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              <strong>OOS:</strong> {R3B_VERIFICATION.oosNote}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              <strong>Walk-forward:</strong> {R3B_VERIFICATION.walkForwardNote}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              <strong>DSR:</strong> {R3B_VERIFICATION.dsrNote}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              <strong>Beneficio de portfolio:</strong> {R3B_VERIFICATION.portfolioBenefitNote}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              <strong>Confianza de verificación:</strong> {R3B_VERIFICATION.verificationConfidenceNote}
            </p>
            <p className="mt-3 text-[11px] text-muted-foreground">Fuente: {R3B_VERIFICATION.sourceDoc}</p>
          </CardBody>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Strategy #2 Discovery — Literature Review &amp; Pre-Registration (Block 9, Phase A)</h2>
        <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-xs text-accent">
          <strong>Fase A: solo literatura.</strong> Este ranking de 5 familias es la revisión de evidencia externa y pre-registración congelada
          (<code>docs/BLOCK9_STRATEGY2_PREREGISTRATION.md</code>) que precedió a cualquier backtest. Los resultados reales del backtest (Fase B) están más abajo. R3-B sigue REJECTED y no fue reutilizado en ninguna familia.
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Familias revisadas (A-T)" value={LITERATURE_FAMILIES_REVIEWED_COUNT} />
          <StatTile label="Top-5 seleccionadas" value={STRATEGY2_TOP5_FAMILIES.length} />
          <StatTile label="Trials acumulados (piso)" value={CUMULATIVE_TRIAL_LEDGER_SUMMARY.priorCumulativeFloor} />
          <StatTile label="Backtests nuevos este bloque" value={CUMULATIVE_TRIAL_LEDGER_SUMMARY.newTrialsThisBlock} />
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Reconciliación: {CUMULATIVE_TRIAL_LEDGER_SUMMARY.reconciledArithmetic}. {CUMULATIVE_TRIAL_LEDGER_SUMMARY.policy}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STRATEGY2_TOP5_FAMILIES.map((fam) => (
            <Card key={fam.letter}>
              <CardHeader title={`#${fam.rank} — ${fam.letter}: ${fam.name}`} description={`Evidence grade ${fam.evidenceGrade} · Score ${fam.score}/100`} />
              <CardBody className="p-4">
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className={`rounded-full border border-border-subtle px-2 py-0.5 text-[11px] font-medium ${DATA_FEASIBILITY_CLASS[fam.dataFeasibility]}`}>{fam.dataFeasibility}</span>
                  <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{fam.executionFeasibility}</span>
                  <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Corr. RS3M: {fam.expectedCorrelationWithRs3m}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <StatTile label="Crowding risk" value={fam.crowdingRisk} />
                  <StatTile label="Decay risk" value={fam.decayRisk} />
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  <strong>Racional económico:</strong> {fam.economicRationale}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  <strong>Mercados / timeframe:</strong> {fam.markets} · {fam.timeframe}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  <strong>Tail risk:</strong> {fam.tailRiskNote}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  <strong>Principal riesgo de falsificación:</strong> {fam.mainFalsificationRisk}
                </p>
                <p className="mt-3 text-[11px] text-muted-foreground">Fuente: {fam.sourceDoc}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Strategy #2 Deep Backtest — Fail-Fast Funnel Results (Block 9.x, Phase B)</h2>
        <div className="mb-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-xs text-accent">
          <strong>Investigación, no ejecución.</strong> 18 de las 20 configuraciones pre-registradas corrieron el funnel de 12 etapas (2 quedaron <code>DATA_INSUFFICIENT</code> — sin cadena de opciones histórica). 2 candidatas
          sobrevivieron — ninguna está conectada a Paper, Alpaca, opciones ni LIVE, y la verificación independiente <strong>no</strong> comenzó automáticamente.
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STRATEGY2_BACKTEST_OUTCOMES.map((fam) => (
            <Card key={fam.letter}>
              <CardHeader title={`${fam.letter}: ${fam.name}`} description={`${fam.configsExecuted} ejecutadas${fam.configsDataInsufficient > 0 ? `, ${fam.configsDataInsufficient} DATA_INSUFFICIENT` : ""}`} />
              <CardBody className="p-4">
                <div className={`mb-2 inline-block rounded-full border border-border-subtle px-2 py-0.5 text-[11px] font-medium ${fam.verdict === "CANDIDATE_FOUND" ? "text-buy" : "text-muted-foreground"}`}>
                  {fam.verdict === "CANDIDATE_FOUND" ? `CANDIDATE: ${fam.candidateConfigIds.join(", ")}` : "NO CANDIDATE"}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">{fam.summary}</p>
                <p className="mt-3 text-[11px] text-muted-foreground">Fuente: {fam.sourceDoc}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Candidatas supervivientes — detalle</h2>
        <p className="mb-4 text-xs text-muted">
          <code>independentVerificationStatus: NOT_STARTED</code> para ambas — la verificación independiente (al estilo Block 8.4) es un paso futuro, separado y explícitamente autorizado, no automático.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {STRATEGY2_CANDIDATES.map((c) => (
            <Card key={c.configId}>
              <CardHeader title={c.configId} description={c.family} />
              <CardBody className="p-4">
                <p className="text-[11px] text-muted-foreground">{c.description}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <StatTile label="Net total return" value={`${c.netTotalReturnPct.toFixed(1)}%`} />
                  <StatTile label="Sharpe anualizado" value={c.annualizedSharpe?.toFixed(3) ?? "—"} />
                  <StatTile label="MaxDD" value={`${c.maxDrawdownPct.toFixed(1)}%`} />
                  <StatTile label="DSR (pool acumulado)" value={c.dsrCumulativePool?.toFixed(3) ?? "—"} />
                  <StatTile label="Corr. vs RS3M" value={c.correlationVsRs3m?.toFixed(3) ?? "—"} />
                  <StatTile label="Verificación" value={c.independentVerificationStatus} valueClassName="text-wait" />
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  <strong>Portfolio 50/50 con RS3M:</strong> Sharpe {c.portfolioBlendSharpe?.toFixed(3) ?? "—"}, MaxDD {c.portfolioBlendMaxDrawdownPct?.toFixed(1) ?? "—"}%.
                </p>
                <p className="mt-3 text-[11px] text-muted-foreground">Fuente: {c.sourceDoc}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
