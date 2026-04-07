import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";
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
    authorized({ auth, request }) {
      const user = auth?.user as { isApproved?: boolean } | undefined;
      if (!user) return false; // not authenticated → redirect to signIn
      if (!user.isApproved) {
        return NextResponse.redirect(new URL("/auth/pending", request.url));
      }
      return true;
    },
    session({ session, token }) {
      (session.user as { isApproved?: boolean }).isApproved =
        token.isApproved as boolean;
      return session;
    },
  },
} satisfies NextAuthConfig;
