import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

export const authConfig = {
  providers: [
    Google({ allowDangerousEmailAccountLinking: true }),
    Credentials({
      authorize: () => null, // real logic in auth.ts
    }),
  ],
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    authorized({ auth }) {
      return !!(auth?.user as { isApproved?: boolean } | undefined)?.isApproved;
    },
    session({ session, token }) {
      (session.user as { isApproved?: boolean }).isApproved =
        token.isApproved as boolean;
      return session;
    },
  },
} satisfies NextAuthConfig;
