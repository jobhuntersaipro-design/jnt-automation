# Auth Security Fixes

## Overview

Address critical and medium security issues found in the auth security audit.
Fixes are ordered by severity — implement top to bottom.

---

## Fix 1 — Rate Limiting (Critical)

See `rate-limiting-spec.md` for full implementation details. Summary:

- Use `@upstash/ratelimit` + Upstash Redis (serverless-compatible)
- Create reusable utility at `src/lib/rate-limit.ts`
- Apply to: `/api/auth/register`, `/api/auth/forgot-password`, `/api/auth/reset-password`

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Refer to `rate-limiting-spec.md` for endpoint limits, window sizes, and error handling.

---

## Fix 2 — bcrypt DoS via Unbounded Password Length (Critical)

bcrypt is intentionally slow. A maliciously long password (e.g. 10MB string) will block
the Node.js thread for seconds. Add a max length guard **before** calling `bcrypt.hash()`
in all three places it's used.

### Files to modify

**`src/app/api/auth/register/route.ts`**
**`src/app/api/auth/reset-password/route.ts`**
**`src/app/api/settings/password/route.ts`** (if exists)

### Fix

```ts
// Add this check before ANY bcrypt.hash() call
if (password.length > 128) {
  return NextResponse.json(
    { error: "Password must be 128 characters or fewer." },
    { status: 400 }
  );
}
```

Also add client-side validation to match:
```ts
// In form validation (register, reset-password, settings/password pages)
if (password.length > 128) {
  setError("Password must be 128 characters or fewer.");
  return;
}
```

---

## Fix 3 — Password Reset Race Condition (Critical)

Current flow finds the token, validates it, then deletes it in separate queries.
Under concurrent requests, the same token can be used twice before deletion completes.

### File to modify

**`src/app/api/auth/reset-password/route.ts`**

### Current (vulnerable) pattern
```ts
// Step 1: find token
const token = await prisma.verificationToken.findUnique({ where: { token } });
if (!token) return error;

// Step 2: update password
await prisma.agent.update({ where: { email: token.identifier }, data: { password: hashed } });

// Step 3: delete token (race window between step 1 and here)
await prisma.verificationToken.delete({ where: { token } });
```

### Fix — use atomic delete as the validation step
```ts
// Attempt to delete the token atomically — if it doesn't exist, it was already used
let tokenRecord;
try {
  tokenRecord = await prisma.verificationToken.delete({
    where: { token },
  });
} catch {
  // Token not found — already used or never existed
  return NextResponse.json(
    { error: "This reset link is invalid or has already been used." },
    { status: 400 }
  );
}

// Now check expiry on the deleted record
if (tokenRecord.expires < new Date()) {
  return NextResponse.json(
    { error: "This reset link has expired. Please request a new one." },
    { status: 400 }
  );
}

// Safe to update password
await prisma.agent.update({
  where: { email: tokenRecord.identifier },
  data: { password: await bcrypt.hash(password, 12) },
});
```

---

## Fix 4 — Email Enumeration (Medium)

### Issue A — Registration returns 409 for existing emails

Currently returning a distinct error when an email is already registered, allowing
attackers to enumerate valid accounts.

**File:** `src/app/api/auth/register/route.ts`

```ts
// Before — reveals whether email exists
if (existingAgent) {
  return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
}

// After — same response regardless
if (existingAgent) {
  return NextResponse.json(
    { message: "If this email is not registered, you will receive a confirmation shortly." },
    { status: 200 }
  );
}
```

> Note: This means users who accidentally re-register won't get an error — they'll think
> it worked. Add a note in the pending page: "Already registered? Check your inbox or
> contact help@easystaff.top."

### Issue B — Login shows distinct errors for missing account vs OAuth-only account

**File:** `src/auth.ts` — Credentials `authorize()` function

```ts
// Before — reveals account existence
if (!agent) return null; // NextAuth shows "No account found"
if (!agent.password) return null; // NextAuth shows "Please sign in with Google"

// After — same generic error for both
if (!agent || !agent.password) return null; // Always: "Invalid email or password"
```

Also update the sign-in page to show a single generic error message regardless of
the NextAuth error type:

```ts
// login/page.tsx — replace specific error messages with generic one
const errorMessage = "Invalid email or password. Please try again.";
```

---

## Files to Create / Modify

| File | Action |
|---|---|
| `src/lib/rate-limit.ts` | Create — reusable Upstash rate limiter (see rate-limiting-spec.md) |
| `src/app/api/auth/register/route.ts` | Modify — bcrypt guard, email enumeration fix |
| `src/app/api/auth/reset-password/route.ts` | Modify — atomic delete, bcrypt guard |
| `src/app/api/auth/forgot-password/route.ts` | Modify — rate limiting |
| `src/app/api/settings/password/route.ts` | Modify — bcrypt guard (if exists) |
| `src/auth.ts` | Modify — generic Credentials error message |
| `src/app/auth/login/page.tsx` | Modify — generic error message display |
| `src/app/auth/register/page.tsx` | Modify — client-side password max length, updated success message |
| `src/app/auth/reset-password/page.tsx` | Modify — client-side password max length |

---

## Out of Scope (Acknowledged, Not Fixed)

### JWT not invalidated after password change (Low)
Standard JWT limitation — existing sessions survive a password reset. Acceptable
for this project at current scale. Mitigation if needed later: store a `passwordChangedAt`
timestamp on Agent and reject JWTs issued before that time.

### `allowDangerousEmailAccountLinking` (Low)
Already fixed — removed from `auth.config.ts`, added `OAuthAccountNotLinked` error
handling on the login page with a toast directing users to sign in with email first.

---

## Testing

### Fix 2 — bcrypt DoS
1. Submit registration with a 129-character password → `400` error returned
2. Submit with 128-character password → succeeds normally

### Fix 3 — Race condition
1. Submit a valid reset token
2. Immediately submit the same token again (concurrent request)
3. Second request should return "invalid or already used" error

### Fix 4 — Email enumeration
1. Register with an existing email → same success message as new email
2. Sign in with unknown email → same error as wrong password
3. Sign in with Google-only account using email + password → same generic error

## Status

Not started. Complete auth phases 1–3 first.
