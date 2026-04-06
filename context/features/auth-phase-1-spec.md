
# Auth Phase 1 — NextAuth v5 Setup + Google Provider

## Overview

Set up NextAuth v5 with Prisma adapter and Google OAuth. Use NextAuth's default pages for
testing. Protect all `/dashboard/*` routes — redirect unauthenticated users to sign-in.

## Requirements

- Install NextAuth v5 (`next-auth@beta`) and `@auth/prisma-adapter`
- Set up split auth config pattern for edge compatibility
- Add Google OAuth provider
- Protect `/dashboard/*` routes using Next.js middleware (proxy pattern)
- Redirect unauthenticated users to `/auth/login`

## Files to Create

1. `src/auth.config.ts` — Edge-compatible config (providers only, no adapter)
2. `src/auth.ts` — Full config with Prisma adapter and JWT strategy
3. `src/app/api/auth/[...nextauth]/route.ts` — Export handlers from `auth.ts`
4. `src/middleware.ts` — Route protection with redirect logic
5. `src/types/next-auth.d.ts` — Extend Session type with `user.id` and `user.isApproved`

## Prisma Adapter Notes

The schema uses `Agent` instead of `User`, and `agentId` instead of `userId` on
`Account` and `Session` models. Configure the adapter to map correctly:

```ts
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

adapter: PrismaAdapter(prisma, {
  userModel: "agent",
  accountModel: "account",
  sessionModel: "session",
}),
```

## Route Protection

Protect all routes under `/dashboard` — redirect to `/auth/login` if no session.
Allow `/auth/*` routes to pass through unauthenticated.

```ts
// src/middleware.ts
export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

## Approval Gate

After Google sign-in, check `isApproved` on the Agent row. If `false`, redirect to
`/auth/pending` instead of `/dashboard`. Add this check in the `signIn` callback:

```ts
callbacks: {
  async signIn({ user }) {
    const agent = await prisma.agent.findUnique({ where: { email: user.email! } });
    if (!agent?.isApproved) return "/auth/pending";
    return true;
  },
}
```

## Environment Variables

```env
AUTH_SECRET=                  # generate with: npx auth secret
AUTH_GOOGLE_ID=               # from Google Cloud Console
AUTH_GOOGLE_SECRET=           # from Google Cloud Console
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or use existing
3. Enable Google OAuth API
4. Create OAuth credentials (Web application)
5. Add authorised redirect URI: `http://localhost:3000/api/auth/callback/google`
6. For production: `https://yourdomain.com/api/auth/callback/google`

## Testing

1. Go to `/dashboard` — should redirect to NextAuth default sign-in page
2. Click "Sign in with Google"
3. Complete Google OAuth flow
4. If `isApproved: true` → redirected to `/dashboard`
5. If `isApproved: false` → redirected to `/auth/pending`

## References

- Edge compatibility: https://authjs.dev/getting-started/installation#edge-compatibility
- Prisma adapter: https://authjs.dev/getting-started/adapters/prisma
- Google provider: https://authjs.dev/getting-started/authentication/oauth
