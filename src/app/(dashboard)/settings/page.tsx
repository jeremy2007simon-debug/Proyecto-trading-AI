import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Account, market, and notification configuration."
      />
      <ComingSoon
        title="Settings not implemented yet"
        description="Account management arrives with Supabase Auth; market and notification preferences arrive with the Market Data Engine and Notifications module."
        plannedFeatures={[
          "Supabase Auth sign-in and session management",
          "Active markets and timeframes",
          "Notification channels (Telegram, email, in-app)",
        ]}
      />
    </div>
  );
}
