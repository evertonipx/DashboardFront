import { ManagerRouteShell } from "@/components/app/authenticated-route-shell";

export default function ManagerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ManagerRouteShell>{children}</ManagerRouteShell>;
}
