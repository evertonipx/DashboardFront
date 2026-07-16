import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { PeriodAnalysisDashboard } from "@/components/app/period-analysis-dashboard";

export default function ManagerAnalyticsPage() {
  return (
    <AuthGuard requireManager>
      <AppShell
        mode="manager"
        title="Análises"
        description="Leituras operacionais configuráveis por intervalo e cenário."
      >
        <PeriodAnalysisDashboard manager />
      </AppShell>
    </AuthGuard>
  );
}
