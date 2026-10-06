import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

export const authConfig = {
  providers: [
    Google({}),
    Credentials({
      authorize: () => null, // real logic in auth.ts
    }),
  ],
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    authorized({ auth }) {
      // Signed in? Approval is enforced by the dashboard layout, which sees a
      // fresh flag; the edge proxy only has the cookie's cached copy.
      return Boolean(auth?.user);
    },
    session({ session, token }) {
      (session.user as { isApproved?: boolean }).isApproved =
        token.isApproved as boolean;
      return session;
    },
  },
} satisfies NextAuthConfig;
