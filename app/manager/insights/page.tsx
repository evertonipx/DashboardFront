import { AiInsightsDashboard } from "@/components/app/ai-insights-dashboard";
import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";

export default function ManagerInsightsPage() {
  return (
    <AuthGuard requireManager requireMaster>
      <AppShell
        mode="manager"
        title="Configuração IA"
        description="Configure credenciais, modelos e parâmetros da análise por IA no escopo empresarial selecionado."
      >
        <AiInsightsDashboard />
      </AppShell>
    </AuthGuard>
  );
}
