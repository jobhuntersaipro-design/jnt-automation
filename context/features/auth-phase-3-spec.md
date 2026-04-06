# Auth Phase 3 — Custom Auth UI

## Overview

Replace NextAuth default pages with custom sign-in, register, and pending pages
that match the existing design system. Update the account menu in the nav bar
to show real session data (name, email, avatar).

## Design System Reminder

| Token | Value |
|---|---|
| `surface` | #f8f9fa |
| `surface_container_lowest` | #ffffff |
| `on_surface` | #191c1d |
| `on_surface_variant` | #424654 |
| `primary` | #0056D2 |
| `outline_variant` | #c3c6d6 |
- Font: Manrope (headings) + Inter (body)
- Radius: `md` (0.375rem) or `lg` (0.5rem) — no pills
- No pure black, no 1px dividers

---

## Pages to Create

### 1. Sign In Page — `/auth/login`

**Layout:** Centered card on `surface` background. Logo at top.

**Contents:**
- Heading: "Welcome back"
- Subtext: "Sign in to your account"
- "Continue with Google" button (Google icon + label, outlined style)
- Divider: `———— or ————`
- Email input
- Password input (with show/hide toggle)
- "Sign In" button (primary, full width)
- Link: "Don't have an account? Register"
- Error display: inline below the form (e.g. "Invalid email or password", "Account pending approval — contact jobhunters.ai.pro@gmail.com")

**Validation:**
- Email: required, valid format
- Password: required

**On submit:**
- Call NextAuth `signIn("credentials", { email, password, redirect: false })`
- On error → show inline error message
- On success → redirect to `/dashboard`

**Google button:**
- Call `signIn("google")`
- NextAuth handles redirect automatically

---

### 2. Register Page — `/auth/register`

**Layout:** Same centered card as sign-in.

**Contents:**
- Heading: "Create an account"
- Subtext: "You'll need approval before accessing the app"
- "Continue with Google" button (same as sign-in)
- Divider: `———— or ————`
- Name input
- Company name input (optional — placeholder: "Optional")
- Email input
- Password input (show/hide toggle)
- Confirm password input (show/hide toggle)
- "Create Account" button (primary, full width)
- Link: "Already have an account? Sign in"
- Error display: inline below the form

**Validation (client-side):**
- Name: required
- Email: required, valid format
- Password: required, minimum 8 characters
- Confirm password: must match password

**On submit:**
- `POST /api/auth/register` with form data
- On `409` → "An account with this email already exists"
- On `400` → show validation error from response
- On `201` → redirect to `/auth/pending`

**Google button:**
- Same as sign-in — Google OAuth handles the pending state automatically

---

### 3. Pending Page — `/auth/pending`

**Layout:** Centered, minimal. No card — just centered content on `surface` background.

**Contents:**
- Icon: clock or hourglass (Lucide `Clock` or `Hourglass`)
- Heading: "Account pending approval"
- Body: "Your account has been created. We'll review it and get back to you shortly."
- Contact line: "Questions? Email us at jobhunters.ai.pro@gmail.com"
- Link: "← Back to sign in"

No form, no actions. Static page.

---

## Nav Bar — Account Menu Update

The existing account menu dropdown (top right of nav) currently shows placeholder data.
Update it to use real session data.

**Display:**
- Avatar: initials fallback (first letter of first name + first letter of last name)
  - Google users may have a profile image — use `next/image` if `session.user.image` exists
  - Male ring: `primary` (#0056D2), 2px — derive from `isSuperAdmin` for now (superadmin = special ring color `tertiary`)
  - Default ring: `outline_variant`
- Name: `session.user.name`
- Email: `session.user.email`

**Avatar initials component** — reusable, create at `src/components/ui/avatar.tsx`:
```ts
// Props
{ name: string; imageUrl?: string | null; size?: "sm" | "md" | "lg" }

// Logic
const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
```

**Dropdown items:**
- Settings → `/settings` (placeholder route, page not built yet)
- Sign out → calls `signOut()`, redirects to `/auth/login`

---

## Files to Create / Modify

| File | Action |
|---|---|
| `src/app/auth/login/page.tsx` | Create — sign-in page |
| `src/app/auth/register/page.tsx` | Create — register page |
| `src/app/auth/pending/page.tsx` | Create — pending approval page |
| `src/components/ui/avatar.tsx` | Create — reusable avatar with initials fallback |
| `src/components/nav/account-menu.tsx` | Modify — use real session data |
| `src/auth.config.ts` | Modify — set `pages.signIn: "/auth/login"` |

## Update `auth.config.ts`

Point NextAuth to the custom sign-in page so redirects go to `/auth/login` instead
of the default NextAuth page:

```ts
pages: {
  signIn: "/auth/login",
}
```

---

## Testing

1. Go to `/dashboard` → redirects to `/auth/login` (custom page)
2. Sign in with Google → completes OAuth → lands on `/dashboard`
3. Sign in with email + password → lands on `/dashboard`
4. Wrong password → inline error shown, no redirect
5. Unapproved account → redirects to `/auth/pending`
6. Register new account → redirects to `/auth/pending`
7. Check nav bar — shows correct name, email, avatar initials
8. Click "Sign out" → redirects to `/auth/login`
9. Google user with profile image → image shows in nav bar avatar

## Status

Not started. Complete Phase 1 and Phase 2 first.
