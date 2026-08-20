import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { listResearchProjects } from "@/novacore/research-lab/adapters/block-research-adapter";

export default function NovaCoreResearchPage() {
  const projects = listResearchProjects();

  return (
    <div>
      <PageHeader title="Research Lab" description="Resúmenes sobre el motor de investigación existente (Bloques 4-5). Las cifras están transcritas de los informes congelados, nunca recalculadas." />

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
    </div>
  );
}
