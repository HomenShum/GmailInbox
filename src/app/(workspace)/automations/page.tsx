import { redirect } from "next/navigation";

export default function AutomationsRedirect() {
  redirect("/settings?tab=automations");
}
