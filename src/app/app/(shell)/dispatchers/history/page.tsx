import { notFound } from "next/navigation";
import { ProfileHistory } from "@/components/v2/people/profile-history";
import { prisma } from "@/lib/prisma";
import { listProfileChanges } from "@/lib/v2/people/data";
import { dispatcherScope, v2Session } from "@/lib/v2/session";

export default async function DispatcherHistoryPage() {
  const s = await v2Session();
  if (!s) notFound();
  // A branch supervisor sees changes to their branches' dispatchers only.
  const only = s.member ? new Set((await prisma.dispatcher.findMany({ where: { agentId: s.agentId, ...dispatcherScope(s) }, select: { id: true } })).map((d) => d.id)) : undefined;
  return <ProfileHistory changes={await listProfileChanges(s.agentId, only)} />;
}
