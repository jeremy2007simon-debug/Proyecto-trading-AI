import type { SignalDirection } from "@/core/shared/types";

const STYLES: Record<SignalDirection, string> = {
  BUY: "bg-buy/15 text-buy border-buy/30",
  SELL: "bg-sell/15 text-sell border-sell/30",
  WAIT: "bg-wait/15 text-wait border-wait/30",
};

interface SignalBadgeProps {
  signal: SignalDirection;
  size?: "sm" | "md" | "lg";
}

const SIZE_STYLES: Record<NonNullable<SignalBadgeProps["size"]>, string> = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
  lg: "text-lg px-4 py-1.5",
};

export function SignalBadge({ signal, size = "md" }: SignalBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border font-semibold tracking-wide ${STYLES[signal]} ${SIZE_STYLES[size]}`}
    >
      {signal}
    </span>
  );
}
