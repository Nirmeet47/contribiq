import { redirect } from "next/navigation";

export default function LegacyPreferencesRedirectPage() {
  redirect("/preferences");
}
