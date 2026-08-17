import type { SampleQualityLabel } from "@/core/backtesting/types";

const STYLES: Record<SampleQualityLabel, string> = {
  INSUFFICIENT: "bg-sell/15 text-sell border-sell/30",
  LOW: "bg-wait/15 text-wait border-wait/30",
  MEDIUM: "bg-accent/15 text-accent border-accent/30",
  HIGH: "bg-buy/15 text-buy border-buy/30",
};

const LABELS: Record<SampleQualityLabel, string> = {
  INSUFFICIENT: "Insufficient sample",
  LOW: "Low sample",
  MEDIUM: "Medium sample",
  HIGH: "High sample",
};

interface SampleQualityBadgeProps {
  quality: SampleQualityLabel;
  tradeCount: number;
}

/**
 * Rendered next to every metrics summary in this dashboard (point 18) —
 * a Sharpe ratio or expectancy figure must never be shown without this
 * label, since a strong-looking number from ~15 trades is not evidence.
 */
export function SampleQualityBadge({ quality, tradeCount }: SampleQualityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold tracking-wide ${STYLES[quality]}`}
      title="Sample-quality thresholds: <10 trades insufficient, 10-29 low, 30-99 medium, 100+ high. A rule of thumb, not a statistical guarantee."
    >
      {LABELS[quality]} ({tradeCount} trades)
    </span>
  );
}
