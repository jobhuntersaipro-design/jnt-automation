import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { agentAdapter } from "@/lib/auth-adapter";
import { prisma } from "@/lib/prisma";

class PendingApprovalError extends CredentialsSignin {
  code = "pending_approval" as const;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: agentAdapter,
  session: { strategy: "jwt" },
  providers: [
    ...authConfig.providers.filter((p) => p.id !== "credentials"),
    Credentials({
      async authorize(credentials) {
        const { email, password } = credentials as {
          email: string;
          password: string;
        };
        if (!password || password.length > 128) return null;
        const agent = await prisma.agent.findUnique({ where: { email } });
        if (!agent || !agent.password) return null;
        const valid = await bcrypt.compare(password, agent.password);
        if (!valid) return null;
        if (!agent.isApproved) throw new PendingApprovalError();
        return {
          id: agent.id,
          email: agent.email,
          name: agent.name,
          isApproved: agent.isApproved,
          isSuperAdmin: agent.isSuperAdmin,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,

    async signIn() {
      // Credentials: PendingApprovalError thrown in authorize
      // OAuth: always allow sign-in — proxy gates on isApproved
      return true;
    },

    async jwt({ token, user, profile }) {
      if (user?.id) {
        token.id = user.id;
        token.picture = (profile as { picture?: string })?.picture ?? null;
        const agent = await prisma.agent.findUnique({
          where: { id: user.id },
          select: { isApproved: true, isSuperAdmin: true },
        });
        token.isApproved = agent?.isApproved ?? false;
        token.isSuperAdmin = agent?.isSuperAdmin ?? false;
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.image = token.picture as string | null;
      session.user.isApproved = token.isApproved as boolean;
      session.user.isSuperAdmin = token.isSuperAdmin as boolean;
      return session;
    },
  },
});
