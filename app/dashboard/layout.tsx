import { DashboardRouteShell } from "@/components/app/authenticated-route-shell";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <DashboardRouteShell>{children}</DashboardRouteShell>;
}
