import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { buildActivityFeed } from "@/novacore/activity-feed/build-activity-feed";
import type { NovaCoreEventDomain } from "@/novacore/events/types";

const DOMAINS: NovaCoreEventDomain[] = ["research", "strategy", "execution", "system"];

export default async function NovaCoreActivityPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const { domain } = await searchParams;
  const selectedDomain = DOMAINS.includes(domain as NovaCoreEventDomain) ? (domain as NovaCoreEventDomain) : undefined;
  const events = buildActivityFeed({ domain: selectedDomain, limit: 100 });

  return (
    <div>
      <PageHeader title="Activity Feed" description="Unified timeline across research, strategy, execution, and system events." />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/novacore/activity"
          className={`rounded-full border px-3 py-1 text-xs ${!selectedDomain ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"}`}
        >
          All
        </Link>
        {DOMAINS.map((d) => (
          <Link
            key={d}
            href={`/novacore/activity?domain=${d}`}
            className={`rounded-full border px-3 py-1 text-xs capitalize ${selectedDomain === d ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"}`}
          >
            {d}
          </Link>
        ))}
      </div>

      <Card>
        <CardBody className="space-y-3 p-4">
          {events.length === 0 ? (
            <p className="text-sm text-muted">No events recorded yet.</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="border-b border-border-subtle pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{new Date(event.timestamp).toLocaleString()}</span>
                  <span className="rounded-full border border-border-subtle px-2 py-0.5 capitalize">{event.domain}</span>
                  <span className="rounded-full border border-border-subtle px-2 py-0.5">{event.type.replace(/_/g, " ")}</span>
                </div>
                <p className="mt-1 text-sm text-foreground">{event.summary}</p>
                {event.sourceDoc ? <p className="mt-0.5 text-[11px] text-muted-foreground">Source: {event.sourceDoc}</p> : null}
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
