import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { ViewsManager } from "@/components/app/views-manager";

export default function ManagerViewsPage() {
  return (
    <AuthGuard requireManager>
      <AppShell
        mode="manager"
        title="Visões"
        description="URLs autenticadas para exibir gráficos em tela inteira do conteúdo."
      >
        <ViewsManager />
      </AppShell>
    </AuthGuard>
  );
}
