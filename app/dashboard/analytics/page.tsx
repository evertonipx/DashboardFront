import { AppShell } from "@/components/app/app-shell";
import { AnalysisDashboard } from "@/components/app/analysis-dashboard";
import { AuthGuard } from "@/components/app/auth-guard";

export default function DashboardAnalyticsPage() {
  return (
    <AuthGuard>
      <AppShell
        mode="client"
        title="Análises"
        description="Consulta operacional por datas e cenários selecionados."
      >
        <AnalysisDashboard />
      </AppShell>
    </AuthGuard>
  );
}
