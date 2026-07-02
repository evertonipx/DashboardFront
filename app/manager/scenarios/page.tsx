import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { ScenarioManager } from "@/components/app/scenario-manager";

export default function ManagerScenariosPage() {
  return (
    <AuthGuard requireManager>
      <AppShell
        mode="manager"
        title="Cenários"
        description="Crie e ajuste as regras que alimentam os relatórios."
      >
        <ScenarioManager />
      </AppShell>
    </AuthGuard>
  );
}
