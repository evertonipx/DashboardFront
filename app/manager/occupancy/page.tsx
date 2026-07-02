import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { OccupancyScenarioDashboard } from "@/components/app/occupancy-scenario-dashboard";

export default function ManagerOccupancyPage() {
  return (
    <AuthGuard requireManager>
      <AppShell
        mode="manager"
        title="Ocupação Ao Vivo"
        description="Gestão da ocupação em tempo real, agregados e alertas por cenário de áreas."
      >
        <OccupancyScenarioDashboard />
      </AppShell>
    </AuthGuard>
  );
}
