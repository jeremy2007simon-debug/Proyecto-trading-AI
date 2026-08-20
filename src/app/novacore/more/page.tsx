import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { MORE_MENU_LINKS } from "@/lib/novacore-navigation";

export default function NovaCoreMorePage() {
  return (
    <div>
      <PageHeader title="Más" description="Información secundaria — no forma parte de la navegación principal para no saturar la pantalla." />

      <Card>
        <CardBody className="divide-y divide-border-subtle p-0">
          {MORE_MENU_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-raised">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="size-4" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{link.label}</p>
                  <p className="text-xs text-muted">{link.description}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
              </Link>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
