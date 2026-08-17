import { FlaskConical } from "lucide-react";

/**
 * Renders whenever a section of the UI is fed by `src/lib/mock/*.mock.ts`
 * data instead of a real pipeline run. Must be shown any time
 * `IS_MOCK_DATA` is true for the data behind a component — never hide
 * mock data behind a UI that looks indistinguishable from live output.
 */
export function MockDataBadge() {
  return (
    <span
      title="No live Market Data Engine is connected yet — these values are illustrative mock data, not a real signal."
      className="inline-flex items-center gap-1.5 rounded-full border border-mock/30 bg-mock/10 px-2.5 py-1 text-xs font-medium text-mock"
    >
      <FlaskConical className="size-3.5" strokeWidth={2.5} />
      MOCK DATA
    </span>
  );
}
