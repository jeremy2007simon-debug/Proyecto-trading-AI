import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";

export default function NovaCoreSettingsPage() {
  return (
    <div>
      <PageHeader title="Ajustes" description="Honestidad ante todo: no hay ajustes editables." />

      <Card>
        <CardBody className="space-y-3 p-4 text-sm text-muted">
          <p>
            NovaCore no expone ningún control de configuración, ejecución ni edición de estrategia. Esta pantalla existe para dejarlo explícito — no
            porque falte implementar algo, sino porque el diseño lo prohíbe deliberadamente.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>No se puede activar LIVE trading desde aquí ni desde ningún otro sitio de NovaCore.</li>
            <li>No se pueden aprobar rebalances ni enviar órdenes.</li>
            <li>No se pueden editar los parámetros de RS3M (lookback, universo, ranking, ejecución).</li>
            <li>No hay auto-optimización ni sistema de usuarios.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
