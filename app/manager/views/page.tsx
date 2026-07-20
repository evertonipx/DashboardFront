import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { ViewsManager } from "@/components/app/views-manager";

export default function ManagerViewsPage() {
  return (
    <AuthGuard requireManager>
      <AppShell
        mode="manager"
        title="Visões"
        description="Configure visões autenticadas e distribua o Ao Vivo em um ou mais monitores."
      >
        <ViewsManager />
      </AppShell>
    </AuthGuard>
  );
}
