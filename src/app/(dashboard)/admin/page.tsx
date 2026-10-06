import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getAllAgents } from "@/lib/db/admin";
import { AdminClient } from "@/components/admin/admin-client";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");
  if (!session.user.isSuperAdmin) redirect("/dashboard");

  const agents = await getAllAgents();

  return (
    <main className="flex-1 min-w-0 overflow-x-clip lg:overflow-y-auto px-4 lg:px-16 py-6 lg:py-8">
      <div className="max-w-[90rem] mx-auto">
        <h1 className="text-[1.6rem] font-bold text-on-surface tracking-tight font-(family-name:--font-manrope)">
          Admin Panel
        </h1>
        <p className="text-[0.85rem] text-on-surface-variant mt-0.5 mb-8">
          Manage accounts, approvals, billing and invoices.
        </p>
        <AdminClient initialAgents={agents} currentUserId={session.user.id} />
      </div>
    </main>
  );
}
