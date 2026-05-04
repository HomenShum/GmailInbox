import { redirect } from "next/navigation";

export default function TriagePage() {
  redirect("/inbox?tab=triage");
}
