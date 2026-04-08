# Auth Test Cases

## Phase 1 — Google OAuth + Route Protection

### Route Protection
| # | Test | Expected |
|---|---|---|
| 1.1 | Visit `/dashboard` without being logged in | Redirects to `/auth/login` |
| 1.2 | Visit `/dashboard/staff` without being logged in | Redirects to `/auth/login` |
| 1.3 | Visit `/auth/login` while already logged in | Redirects to `/dashboard` |
| 1.4 | Visit `/auth/register` while already logged in | Redirects to `/dashboard` |

### Google OAuth
| # | Test | Expected |
|---|---|---|
| 1.5 | Click "Continue with Google" on sign-in page | Redirects to Google OAuth consent screen |
| 1.6 | Complete Google OAuth with approved account | Redirects to `/dashboard` |
| 1.7 | Complete Google OAuth with unapproved account | Redirects to `/auth/pending` |
| 1.8 | Complete Google OAuth with unknown email (first time) | Creates Agent with `isApproved: false`, redirects to `/auth/pending` |
| 1.9 | Cancel Google OAuth flow | Returns to `/auth/login` with no error |
| 1.10 | Sign in with Google → verify session contains `id`, `isApproved`, `isSuperAdmin` | Session has correct values |
| 1.11 | Sign in as superadmin (`jobhunters.ai.pro@gmail.com`) | `isSuperAdmin: true` in session |

---

## Phase 2 — Email + Password + Registration

### Registration
| # | Test | Expected |
|---|---|---|
| 2.1 | Register with valid name, email, password, confirmPassword | Agent created with `isApproved: false`, redirects to `/auth/pending` |
| 2.2 | Register with company name filled | `companyName` saved to Agent row |
| 2.3 | Register with company name empty | Succeeds — `companyName` is optional |
| 2.4 | Register with mismatched passwords | `400` — "Passwords do not match" |
| 2.5 | Register with password under 8 characters | `400` — validation error |
| 2.6 | Register with password over 128 characters | `400` — "Password must be 128 characters or fewer" |
| 2.7 | Register with invalid email format | `400` — validation error |
| 2.8 | Register with already-registered email | `200` — same generic success message (no 409) |
| 2.9 | Register with missing required fields | `400` — validation error |
| 2.10 | Verify Agent row in Prisma Studio after registration | `isApproved: false`, `isSuperAdmin: false`, password is bcrypt hashed |
| 2.11 | Verify superadmin receives notification email after registration | Email received at `jobhunters.ai.pro@gmail.com` with agent name + email |

### Email + Password Sign In
| # | Test | Expected |
|---|---|---|
| 2.12 | Sign in with correct email + password (approved account) | Redirects to `/dashboard` |
| 2.13 | Sign in with correct email + password (unapproved account) | Redirects to `/auth/pending` |
| 2.14 | Sign in with wrong password | Generic error: "Invalid email or password" |
| 2.15 | Sign in with unregistered email | Generic error: "Invalid email or password" (no distinction) |
| 2.16 | Sign in with Google-only account using email + password | Generic error: "Invalid email or password" (no "use Google" hint) |
| 2.17 | Sign in with empty email | Validation error shown |
| 2.18 | Sign in with empty password | Validation error shown |

### Session Scope
| # | Test | Expected |
|---|---|---|
| 2.19 | Sign in as Agent A → visit `/dashboard` | Only sees Agent A's branches and data |
| 2.20 | Sign in as Agent B → visit `/dashboard` | Only sees Agent B's branches and data, not Agent A's |
| 2.21 | Replace stubbed `agentId` with real session → verify Overview data matches logged-in agent | Correct data shown per agent |

---

## Phase 3 — Custom UI + Forgot/Reset Password

### Sign In Page (`/auth/login`)
| # | Test | Expected |
|---|---|---|
| 3.1 | Visit `/dashboard` unauthenticated | Redirects to `/auth/login` (custom page, not NextAuth default) |
| 3.2 | Submit sign-in form with wrong password | Inline error shown below form, no redirect |
| 3.3 | Submit sign-in form with correct credentials | Redirects to `/dashboard` |
| 3.4 | Click "Don't have an account? Register" | Navigates to `/auth/register` |
| 3.5 | Click "Forgot password?" | Navigates to `/auth/forgot-password` |
| 3.6 | Password show/hide toggle works | Password text toggles visibility |

### Register Page (`/auth/register`)
| # | Test | Expected |
|---|---|---|
| 3.7 | Visit `/auth/register` | Custom register page renders correctly |
| 3.8 | Submit valid registration via form | Redirects to `/auth/pending` |
| 3.9 | Submit with mismatched passwords | Client-side inline error, no API call |
| 3.10 | Submit with password over 128 characters | Client-side inline error, no API call |
| 3.11 | Click "Already have an account? Sign in" | Navigates to `/auth/login` |
| 3.12 | Click "Continue with Google" on register page | Google OAuth flow starts |

### Pending Page (`/auth/pending`)
| # | Test | Expected |
|---|---|---|
| 3.13 | Redirected to `/auth/pending` after registration | Page renders with clock icon + approval message |
| 3.14 | Click "← Back to sign in" | Navigates to `/auth/login` |
| 3.15 | Approve account in Prisma Studio → sign in | Redirects to `/dashboard` successfully |

### Forgot Password (`/auth/forgot-password`)
| # | Test | Expected |
|---|---|---|
| 3.16 | Submit known email | Success message shown: "Check your email", form replaced |
| 3.17 | Submit unknown email | `404` — "No account found with this email" |
| 3.18 | Submit empty email | Client-side validation error |
| 3.19 | Verify reset email received | Email from `help@easystaff.top` with reset link |
| 3.20 | Verify reset link format | `https://easystaff.top/auth/reset-password?token=xxx` |
| 3.21 | Verify token exists in `VerificationToken` table after request | Token row created with 1-hour expiry |

### Reset Password (`/auth/reset-password`)
| # | Test | Expected |
|---|---|---|
| 3.22 | Visit reset link with valid token | Form renders correctly |
| 3.23 | Visit reset link with invalid token | Error shown: "invalid or expired", no form |
| 3.24 | Visit reset link with expired token (after 1 hour) | Error shown: "invalid or expired", no form |
| 3.25 | Submit mismatched passwords | Client-side inline error |
| 3.26 | Submit password under 8 characters | Client-side validation error |
| 3.27 | Submit password over 128 characters | Client-side validation error |
| 3.28 | Submit valid new password | Redirects to `/auth/login` with success message |
| 3.29 | Try to reuse same reset link after successful reset | Error: "invalid or already used" |
| 3.30 | Sign in with new password after reset | Succeeds |
| 3.31 | Verify token deleted from `VerificationToken` after use | Row no longer exists in DB |

### Nav Bar Account Menu
| # | Test | Expected |
|---|---|---|
| 3.32 | Sign in with email account | Nav bar shows correct name + email + initials avatar |
| 3.33 | Sign in with Google account that has profile image | Nav bar shows Google profile image |
| 3.34 | Sign in with Google account with no profile image | Nav bar shows initials fallback |
| 3.35 | Click account menu → click "Sign out" | Signs out, redirects to `/auth/login` |
| 3.36 | After sign out, visit `/dashboard` | Redirects to `/auth/login` |
| 3.37 | Superadmin avatar ring color | Shows `tertiary` ring color (not default) |

---

## Security Fixes

### bcrypt DoS Guard
| # | Test | Expected |
|---|---|---|
| 4.1 | Register with 128-character password | Succeeds |
| 4.2 | Register with 129-character password | `400` — "Password must be 128 characters or fewer" |
| 4.3 | Reset password with 129-character password | `400` — same error |
| 4.4 | Change password in settings with 129-character password | `400` — same error |

### Password Reset Race Condition
| # | Test | Expected |
|---|---|---|
| 4.5 | Submit valid reset token once | Password updated, token deleted |
| 4.6 | Submit same reset token immediately again (simulate concurrent request) | `400` — "invalid or already used" |
| 4.7 | Verify only one password update occurred | DB shows single password change |

### Rate Limiting
| # | Test | Expected |
|---|---|---|
| 4.8 | Hit `/api/auth/register` 4+ times from same IP within 1 hour | 4th request returns `429` with retry-after message |
| 4.9 | Hit `/api/auth/forgot-password` 4+ times from same IP within 1 hour | 4th request returns `429` |
| 4.10 | Hit `/api/auth/reset-password` 6+ times from same IP within 15 min | 6th request returns `429` |
| 4.11 | Wait for rate limit window to expire | Requests succeed again |
| 4.12 | Upstash unavailable (simulate) | Request allowed through (fail open) |

### Email Enumeration
| # | Test | Expected |
|---|---|---|
| 4.13 | Register with existing email | Same response as registering with new email — no 409 |
| 4.14 | Sign in with unknown email | Same error message as wrong password |
| 4.15 | Sign in with Google-only account via credentials | Same generic error — no "sign in with Google" hint |

### OAuth Account Linking
| # | Test | Expected |
|---|---|---|
| 4.16 | Sign in with Google using email that has an existing email+password account | Error toast: "Please sign in with email + password first, then connect Google in Settings" |
| 4.17 | Sign in with email+password after seeing that error | Succeeds normally |
