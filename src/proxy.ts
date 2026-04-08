import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protect all routes except auth pages, public API auth endpoints, and static assets
  matcher: ["/((?!auth|api/auth|_next/static|_next/image|favicon\\.ico).*)"],
};
