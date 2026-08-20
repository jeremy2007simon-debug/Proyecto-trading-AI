import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { RS3M_CANDIDATE_V1 } from "@/core/paper-trading/rs3m/candidate";

export default function NovaCoreAboutPage() {
  return (
    <div>
      <PageHeader title="Acerca de NovaCore" description="Qué es, qué no es." />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Qué es" />
          <CardBody className="p-4 text-sm text-muted">
            NovaCore Trading Lab es un plano de control y observabilidad de solo lectura, construido encima del sistema cuantitativo existente
            (Bloques 1-6), cuyo centro es <code className="text-foreground">{RS3M_CANDIDATE_V1.candidateId}</code> (hash del candidato{" "}
            <code className="text-foreground">{RS3M_CANDIDATE_V1.version}</code>). Deja ver la investigación, la señal, la ejecución Paper y el
            riesgo sin tocar nunca la lógica de la estrategia.
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Qué no es" />
          <CardBody className="p-4 text-sm text-muted">
            No es una app nativa (todavía), no tiene sistema de usuarios, no puede operar en LIVE, no tiene botones de ejecución, no permite editar
            la estrategia, no se auto-optimiza, y no incluye Prop Firm Research (Bloque 8) — deliberadamente fuera de alcance.
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Documentación" />
          <CardBody className="p-4 text-sm">
            <Link href="/novacore/data-sources" className="text-accent hover:underline">
              Ver todas las fuentes de datos →
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
