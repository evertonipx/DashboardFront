import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { ReportsDashboard } from "@/components/app/reports-dashboard";

export default function ManagerReportsPage() {
  return (
    <AuthGuard requireManager>
      <AppShell
        mode="manager"
        title="Relatórios"
        description="Contagem e ocupação analisadas por período."
      >
        <ReportsDashboard manager />
      </AppShell>
    </AuthGuard>
  );
}
