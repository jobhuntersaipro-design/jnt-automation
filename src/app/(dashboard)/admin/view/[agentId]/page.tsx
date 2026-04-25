import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getAgentView } from "@/lib/db/admin";
import { AgentViewClient } from "@/components/admin/agent-view-client";

export default async function AgentViewPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");
  if (!session.user.isSuperAdmin) redirect("/dashboard");

  const { agentId } = await params;
  const data = await getAgentView(agentId);

  if (!data) redirect("/admin");

  return (
    <main className="flex-1 overflow-y-auto px-4 lg:px-16 py-6 lg:py-8">
      <AgentViewClient data={data} />
    </main>
  );
}
