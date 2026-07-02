import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { SuperAdminDashboard } from "@/components/app/super-admin-dashboard";

export default function ManagerMasterPage() {
  return (
    <AuthGuard requireManager requireMaster>
      <AppShell
        mode="manager"
        title="Master"
        description="Gestão cross-tenant de empresas, admins, operadores e módulos."
      >
        <SuperAdminDashboard />
      </AppShell>
    </AuthGuard>
  );
}
