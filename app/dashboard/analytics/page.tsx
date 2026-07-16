import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { PeriodAnalysisDashboard } from "@/components/app/period-analysis-dashboard";

export default function DashboardAnalyticsPage() {
  return (
    <AuthGuard>
      <AppShell
        mode="client"
        title="Análises"
        description="Consulta operacional por datas e cenários selecionados."
      >
        <PeriodAnalysisDashboard />
      </AppShell>
    </AuthGuard>
  );
}
