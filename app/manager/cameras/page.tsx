import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { InfrastructureManager } from "@/components/app/infrastructure-manager";

export default function ManagerCamerasPage() {
  return (
    <AuthGuard requireManager>
      <AppShell
        mode="manager"
        title="Câmeras"
        description="Cadastro de câmeras e line counts para apuração de pessoas."
      >
        <InfrastructureManager view="cameras" />
      </AppShell>
    </AuthGuard>
  );
}
