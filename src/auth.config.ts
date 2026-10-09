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
    authorized({ auth, request }) {
      // v2 (/app) has its own sign-in page.
      const { pathname } = request.nextUrl;
      if (pathname === "/app/login") return true;
      // A dispatcher's payslip link: the signed token in the URL is the access check.
      if (pathname.startsWith("/app/p/")) return true;
      if (pathname.startsWith("/app") && !auth?.user) {
        return Response.redirect(new URL("/app/login", request.nextUrl));
      }
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
