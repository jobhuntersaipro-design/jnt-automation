import { notFound } from "next/navigation";
import { Outlets } from "@/components/v2/people/outlets";
import { listOutletViews } from "@/lib/v2/people/data";
import { v2Session } from "@/lib/v2/session";

export default async function OutletsPage() {
  const s = await v2Session();
  if (!s) notFound();
  return <Outlets outlets={await listOutletViews(s.agentId)} />;
}
