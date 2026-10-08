import Image from "next/image";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { getV2Agent } from "@/lib/ui-version";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";

// v2 app shell. Every route under /app is v2-only; v1 accounts bounce back
// to /dashboard. Phase 1 replaces this header with the v2 design + 中文/English toggle.
export default async function V2Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");
  if (!session.user.isApproved) redirect("/auth/pending");
  const v2 = await getV2Agent();
  if (!v2) redirect("/dashboard");

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      {v2.impersonating && <ImpersonationBanner agentName={v2.impersonatedName!} />}
      <header className="h-14 lg:h-16 shrink-0 flex items-center px-4 lg:px-16 bg-surface-dim">
        <Image src="/logo-blue.png" alt="EasyStaff" width={140} height={36} className="h-10 lg:h-12 w-auto" priority />
        <form
          className="ml-auto"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/auth/login" });
          }}
        >
          <button type="submit" className="text-[0.83rem] font-medium text-on-surface-variant hover:text-on-surface">
            Sign out
          </button>
        </form>
      </header>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
