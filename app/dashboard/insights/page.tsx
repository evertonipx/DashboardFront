import { redirect } from "next/navigation";

export default function DashboardInsightsPage() {
  redirect("/manager/master?section=insights");
}
