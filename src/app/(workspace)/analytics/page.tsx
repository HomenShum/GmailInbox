import { redirect } from "next/navigation";

export default function AnalyticsRedirect() {
  redirect("/goals?view=analytics");
}
