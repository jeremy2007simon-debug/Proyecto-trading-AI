import { PageHeader } from "@/components/dashboard/PageHeader";
import { HealthBadge } from "@/components/novacore/StatusBadge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { getRs3mHealth } from "@/novacore/health/rs3m-health";

export default async function NovaCoreSystemHealthPage() {
  const health = await getRs3mHealth();

  return (
    <div>
      <PageHeader title="Salud del sistema" description="Salud ≠ rendimiento — una estrategia puede estar perdiendo dinero y seguir HEALTHY (su automatización funciona, sus datos están frescos, el broker conecta)." action={<HealthBadge status={health.status} />} />

      <Card>
        <CardHeader title="Checks individuales" description="Cada uno con su propia explicación — una credencial ausente pero esperada nunca aparece como ERROR." />
        <CardBody className="divide-y divide-border-subtle p-0">
          {health.checks.map((check) => (
            <div key={check.name} className="flex items-start justify-between gap-3 px-4 py-3.5">
              <div>
                <p className="text-sm text-foreground">{check.name}</p>
                <p className="mt-0.5 text-xs text-muted">{check.detail}</p>
              </div>
              <HealthBadge status={check.status} />
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
