import { redirect } from "next/navigation";

export default function OpportunitiesRedirect() {
  redirect("/goals?domain=career");
}
