import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.id && session.user.isApproved) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      {children}
    </div>
  );
}
