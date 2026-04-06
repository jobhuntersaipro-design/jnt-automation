import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { agentAdapter } from "@/lib/auth-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: agentAdapter,
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user }) {
      if (!user.email) return false;
      const agent = await prisma.agent.findUnique({
        where: { email: user.email },
      });
      if (!agent?.isApproved) return "/auth/pending";
      return true;
    },

    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.isApproved = true; // signIn callback already verified approval
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.id as string;
      (session.user as { isApproved?: boolean }).isApproved =
        token.isApproved as boolean;
      return session;
    },
  },
});
