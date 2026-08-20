import { redirect } from "next/navigation";

/** Renamed to "Bots" (Mobile UX + Market News addendum §10). Kept as a redirect so any bookmarked/old link still works. */
export default async function NovaCoreStrategyDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/novacore/bots/${id}`);
}
