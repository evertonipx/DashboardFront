import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { WorkerManager } from "@/components/app/worker-manager";

export default function ManagerWorkersPage() {
  return (
    <AuthGuard requireManager>
      <AppShell
        mode="manager"
        title="Workers"
        description="Workers de borda, API keys e heartbeats da empresa."
      >
        <WorkerManager />
      </AppShell>
    </AuthGuard>
  );
}
