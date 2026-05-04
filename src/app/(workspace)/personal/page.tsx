import { redirect } from "next/navigation";

export default function PersonalRedirect() {
  redirect("/goals?domain=admin");
}
