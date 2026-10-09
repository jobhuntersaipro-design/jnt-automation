import { notFound } from "next/navigation";
import { ProfileHistory } from "@/components/v2/people/profile-history";
import { listProfileChanges } from "@/lib/v2/people/data";
import { v2Session } from "@/lib/v2/session";

export default async function DispatcherHistoryPage() {
  const s = await v2Session();
  if (!s) notFound();
  return <ProfileHistory changes={await listProfileChanges(s.agentId)} />;
}
