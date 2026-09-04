import { Skeleton } from "@/components/ui/skeleton";

export function DashboardPanelLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando módulo do painel"
      className="space-y-3"
      role="status"
    >
      <Skeleton className="h-10 w-full sm:w-[220px]" />
      <Skeleton className="h-[280px] w-full" />
    </div>
  );
}
