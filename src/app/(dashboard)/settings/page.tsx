import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings/settings-client";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const agent = await prisma.agent.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      password: true,
      avatarUrl: true,
      companyRegistrationNo: true,
      companyAddress: true,
      stampImageUrl: true,
      createdAt: true,
    },
  });

  if (!agent) redirect("/auth/login");

  const accounts = await prisma.account.findMany({
    where: { agentId: session.user.id },
    select: { provider: true },
  });

  const hasPassword = !!agent.password;
  const connectedProviders = accounts.map((a) => a.provider);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-6 lg:py-10 px-4 lg:px-6">
        <h1 className="font-manrope font-semibold text-2xl text-on-surface mb-8">
          Settings
        </h1>
        <SettingsClient
          name={agent.name}
          email={agent.email}
          imageUrl={agent.avatarUrl ?? session.user.image ?? null}
          hasPassword={hasPassword}
          connectedProviders={connectedProviders}
          companyRegistrationNo={agent.companyRegistrationNo}
          companyAddress={agent.companyAddress}
          stampImageUrl={agent.stampImageUrl}
          memberSince={agent.createdAt.toISOString()}
        />
      </div>
    </div>
  );
}
