import type { ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  valueClassName?: string;
}

export function StatTile({ label, value, hint, valueClassName = "" }: StatTileProps) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold text-foreground ${valueClassName}`}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
