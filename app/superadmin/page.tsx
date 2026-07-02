import { redirect } from "next/navigation";

export default function SuperAdminShortcutPage() {
  redirect("/manager/master");
}
