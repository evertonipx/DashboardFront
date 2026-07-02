import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { LiveDashboardTabs } from "@/components/app/live-dashboard-tabs";

export default function ManagerLivePage() {
  return (
    <AuthGuard requireManager>
      <AppShell
        mode="manager"
        title="Ao Vivo"
        description="Contagem e ocupação em tempo real por location, sub-location ou cenário."
      >
        <LiveDashboardTabs manager />
      </AppShell>
    </AuthGuard>
  );
}
