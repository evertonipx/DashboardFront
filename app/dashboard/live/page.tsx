import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { LiveDashboardTabs } from "@/components/app/live-dashboard-tabs";

export default function DashboardLivePage() {
  return (
    <AuthGuard>
      <AppShell
        mode="client"
        title="Ao Vivo"
        description="Contagem e ocupação em tempo real por location, sub-location ou cenário."
      >
        <LiveDashboardTabs />
      </AppShell>
    </AuthGuard>
  );
}
