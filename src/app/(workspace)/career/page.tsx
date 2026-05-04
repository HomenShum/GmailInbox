import { redirect } from "next/navigation";

export default function CareerRedirect() {
  redirect("/goals?domain=career");
}
