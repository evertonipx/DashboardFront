import { AppShell } from "@/components/app/app-shell";
import { AuthGuard } from "@/components/app/auth-guard";
import { InfrastructureManager } from "@/components/app/infrastructure-manager";

export default function ManagerLocationsPage() {
  return (
    <AuthGuard requireManager>
      <AppShell
        mode="manager"
        title="Locations"
        description="Cadastro de localidades e sub-locations operacionais."
      >
        <InfrastructureManager view="locations" />
      </AppShell>
    </AuthGuard>
  );
}
