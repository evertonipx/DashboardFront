import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { OccupancyScenarioDashboard } from "@/components/app/occupancy-scenario-dashboard";

export default function DashboardOccupancyPage() {
  return (
    <AuthGuard>
      <AppShell
        mode="client"
        title="Ocupação Ao Vivo"
        description="Ocupação em tempo real, agregados e alertas sempre pela configuração do cenário."
      >
        <OccupancyScenarioDashboard />
      </AppShell>
    </AuthGuard>
  );
}
