import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { ReportsDashboard } from "@/components/app/reports-dashboard";

export default function DashboardReportsPage() {
  return (
    <AuthGuard>
      <AppShell
        mode="client"
        title="Relatórios"
        description="Consulta de contagem e ocupação por período."
      >
        <ReportsDashboard />
      </AppShell>
    </AuthGuard>
  );
}
