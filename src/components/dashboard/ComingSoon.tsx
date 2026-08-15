interface ComingSoonProps {
  title: string;
  description: string;
  plannedFeatures: string[];
}

/**
 * Placeholder for sections whose engine (Market Data, Backtesting, Paper
 * Trading, ...) is not implemented yet — routing and layout are wired up
 * so navigation is fully testable today, without inventing data for a
 * module this delivery intentionally does not build.
 */
export function ComingSoon({ title, description, plannedFeatures }: ComingSoonProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/50 px-6 py-10 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p>
      <ul className="mx-auto mt-5 flex max-w-md flex-col gap-1.5 text-left text-xs text-muted-foreground">
        {plannedFeatures.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}
