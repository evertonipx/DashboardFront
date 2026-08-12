import { AppShell } from "@/components/app/app-shell";
import { AnalysisDashboard } from "@/components/app/analysis-dashboard";
import { AuthGuard } from "@/components/app/auth-guard";

export default function ManagerAnalyticsPage() {
  return (
    <AuthGuard requireManager>
      <AppShell
        mode="manager"
        title="Análises"
        description="Leituras operacionais configuráveis por intervalo e cenário."
      >
        <AnalysisDashboard manager />
      </AppShell>
    </AuthGuard>
  );
}
