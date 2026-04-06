# Auth Phase 2 — Email + Password + Registration

## Overview

Add Credentials provider for email + password sign-in, and a registration API route.
Agents can self-register and are placed in a pending state until the superadmin approves
them via Prisma Studio. Superadmin receives an email notification on every new registration.

## Requirements

- Add Credentials provider to existing NextAuth config (split pattern)
- Create registration API route at `POST /api/auth/register`
- Send notification email to superadmin on new registration
- Use `bcryptjs` for password hashing (already installed)
- New agents created with `isApproved: false` by default
- Google OAuth from Phase 1 must still work

## Credentials Provider — Split Pattern

### `src/auth.config.ts` (edge-compatible placeholder)
```ts
Credentials({
  authorize: () => null, // real logic in auth.ts
})
```

### `src/auth.ts` (actual bcrypt validation)
```ts
Credentials({
  async authorize(credentials) {
    const { email, password } = credentials as { email: string; password: string };
    const agent = await prisma.agent.findUnique({ where: { email } });
    if (!agent?.password) return null;
    const valid = await bcrypt.compare(password, agent.password);
    if (!valid) return null;
    return { id: agent.id, email: agent.email, name: agent.name, isApproved: agent.isApproved };
  },
})
```

## Registration API Route

`POST /api/auth/register`

**Request body:**
```json
{
  "name": "string",
  "companyName": "string",
  "email": "string",
  "password": "string",
  "confirmPassword": "string"
}
```

**Validation:**
- All fields required except `companyName` (optional)
- Email must be valid format
- Password minimum 8 characters
- `password` and `confirmPassword` must match
- Email must not already exist in DB

**On success:**
1. Hash password with `bcrypt.hash(password, 12)`
2. Create Agent row: `isApproved: false`, `isSuperAdmin: false`
3. Send notification email to superadmin (see Email Notification below)
4. Return `201` with `{ message: "Registration successful. Awaiting approval." }`

**On error:**
- `400` — validation failure (passwords don't match, invalid email, etc.)
- `409` — email already registered
- `500` — unexpected server error

## Email Notification

Send email to `jobhunters.ai.pro@gmail.com` on every new registration.

**Use Resend** (recommended — simple API, generous free tier):

```bash
npm install resend
```

```env
RESEND_API_KEY=        # from resend.com
NOTIFY_EMAIL=jobhunters.ai.pro@gmail.com
```

**Email content:**
```
Subject: New Agent Registration — [name]

A new agent has registered and is awaiting approval.

Name: [name]
Company: [companyName or "Not provided"]
Email: [email]
Registered at: [timestamp]

Approve via Prisma Studio:
1. Open npx prisma studio
2. Find the Agent row with this email
3. Set isApproved = true
```

## Approval Gate for Credentials

The `signIn` callback from Phase 1 already handles the approval check for Google.
Add the same check for Credentials — if `isApproved: false`, block sign-in and
return an error:

```ts
callbacks: {
  async signIn({ user }) {
    const agent = await prisma.agent.findUnique({ where: { email: user.email! } });
    if (!agent) return false;
    if (!agent.isApproved) return "/auth/pending";
    return true;
  },
}
```

## Session — Add `isApproved` and `isSuperAdmin`

Extend the session to include approval and superadmin status:

```ts
// src/types/next-auth.d.ts
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      isApproved: boolean
      isSuperAdmin: boolean
    } & DefaultSession["user"]
  }
}
```

```ts
// jwt + session callbacks in auth.ts
callbacks: {
  async jwt({ token, user }) {
    if (user) {
      token.id = user.id;
      const agent = await prisma.agent.findUnique({ where: { id: user.id } });
      token.isApproved = agent?.isApproved ?? false;
      token.isSuperAdmin = agent?.isSuperAdmin ?? false;
    }
    return token;
  },
  async session({ session, token }) {
    session.user.id = token.id as string;
    session.user.isApproved = token.isApproved as boolean;
    session.user.isSuperAdmin = token.isSuperAdmin as boolean;
    return session;
  },
}
```

## Replace Stubbed `agentId` in Overview

After this phase, replace the hardcoded `agentId` in `dashboard/page.tsx`:

```ts
// Before (stubbed)
const agent = await prisma.agent.findFirst();
const agentId = agent!.id;

// After
import { auth } from "@/auth";
const session = await auth();
const agentId = session!.user.id;
```

## Testing

```bash
# Register a new agent
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Agent",
    "companyName": "Test Co",
    "email": "test@example.com",
    "password": "password123",
    "confirmPassword": "password123"
  }'
```

1. Verify Agent row created in Prisma Studio with `isApproved: false`
2. Verify superadmin receives notification email
3. Try signing in with unapproved account → should redirect to `/auth/pending`
4. Set `isApproved: true` in Prisma Studio
5. Sign in again → should redirect to `/dashboard`
6. Verify Google OAuth still works
7. Verify session contains `id`, `isApproved`, `isSuperAdmin`

## References

- Credentials provider: https://authjs.dev/getting-started/authentication/credentials
- Resend: https://resend.com/docs/send-with-nextjs
