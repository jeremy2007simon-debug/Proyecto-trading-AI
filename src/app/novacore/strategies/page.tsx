import { redirect } from "next/navigation";

/** Renamed to "Bots" (Mobile UX + Market News addendum §10). Kept as a redirect so any bookmarked/old link still works. */
export default function NovaCoreStrategiesRedirect() {
  redirect("/novacore/bots");
}
