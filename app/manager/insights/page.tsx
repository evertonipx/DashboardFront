import { redirect } from "next/navigation";

export default function ManagerInsightsPage() {
  redirect("/manager/master?section=insights");
}
