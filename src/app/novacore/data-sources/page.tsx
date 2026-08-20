import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { getRs3mExecutionSnapshot } from "@/novacore/execution-center/adapters/rs3m-execution-adapter";
import { getRs3mStrategy } from "@/novacore/strategy-hub/adapters/rs3m-adapter";

const ADDITIONAL_SOURCES: { field: string; source: string }[] = [
  { field: "Gráfica de mercado (SPY/QQQ/DIA/IWM)", source: "Alpaca Market Data API — src/novacore/market-context/adapters/market-benchmark-adapter.ts (lectura en vivo, caché TTL en memoria)" },
  { field: "Market News", source: "Alpaca News API, misma credencial que Market Data — src/novacore/market-news (no conectado en este entorno)" },
  { field: "Notificaciones", source: "Derivadas de Activity Feed + Salud + Guards en vivo — src/novacore/notifications/build-notifications.ts (nunca inventadas)" },
];

export default async function NovaCoreDataSourcesPage() {
  const { strategy } = getRs3mStrategy();
  const execution = await getRs3mExecutionSnapshot();

  return (
    <div>
      <PageHeader title="Fuentes de datos" description="De dónde viene, literalmente, cada dato que NovaCore muestra. Ningún número aparece sin una fuente trazable — o se muestra como no disponible." />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Estrategia RS3M" />
          <CardBody className="space-y-1 p-4 text-xs">
            {Object.entries(strategy.sourceOfTruth).map(([field, source]) => (
              <Row key={field} field={field} source={source} />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Ejecución" />
          <CardBody className="space-y-1 p-4 text-xs">
            {Object.entries(execution.sourceOfTruth).map(([field, source]) => (
              <Row key={field} field={field} source={source} />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Mercado, noticias y notificaciones" />
          <CardBody className="space-y-1 p-4 text-xs">
            {ADDITIONAL_SOURCES.map(({ field, source }) => (
              <Row key={field} field={field} source={source} />
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ field, source }: { field: string; source: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border-subtle py-1.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <span className="shrink-0 text-muted">{field}</span>
      <span className="text-muted-foreground">{source}</span>
    </div>
  );
}
