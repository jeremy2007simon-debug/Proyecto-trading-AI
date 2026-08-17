import { ShieldCheck } from "lucide-react";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatTile } from "@/components/dashboard/StatTile";
import { DEFAULT_RISK_RULES } from "@/core/risk-engine/types";

export default function RiskManagementPage() {
  return (
    <div>
      <PageHeader
        title="Risk Management"
        description="The hard limits every signal must pass before it can become BUY or SELL. These are the actual configured rules, not mock data."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile
          label="Max risk per trade"
          value={`${DEFAULT_RISK_RULES.maxRiskPerTradePct}%`}
        />
        <StatTile
          label="Max daily loss"
          value={`${DEFAULT_RISK_RULES.maxDailyLossPct}%`}
        />
        <StatTile
          label="Max trades / day"
          value={DEFAULT_RISK_RULES.maxTradesPerDay}
        />
        <StatTile
          label="Stop loss"
          value="Mandatory"
          valueClassName="text-buy"
        />
        <StatTile
          label="Martingale"
          value="Forbidden"
          valueClassName="text-sell"
        />
        <StatTile
          label="Averaging down"
          value="Forbidden"
          valueClassName="text-sell"
        />
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-xl border border-buy/30 bg-buy/10 px-4 py-3 text-sm text-buy">
        <ShieldCheck className="size-4" strokeWidth={2.5} />
        Kill switch is inactive. No trading limit has been reached today.
      </div>

      <ComingSoon
        title="Risk event history not available yet"
        description="Once the Risk Engine (src/core/risk-engine/types.ts) is wired to real signals, every approval, rejection, and kill-switch event will be logged to risk_events and listed here."
        plannedFeatures={[
          "Timeline of SIGNAL_APPROVED / SIGNAL_REJECTED events",
          "Daily loss and trade-count usage against the limits above",
          "Manual kill switch activation, with reason logging",
        ]}
      />
    </div>
  );
}
