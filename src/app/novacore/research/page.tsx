import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { FX_TOP5_FAMILY_SUMMARIES, R3B_VERIFICATION, US_INDEX_TOP5_FAMILY_SUMMARIES, listResearchProjects } from "@/novacore/research-lab/adapters/block-research-adapter";

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
    </div>
  );
}
