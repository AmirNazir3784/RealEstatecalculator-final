# Supabase Authentication Checklist — app.everyrealestatecalculator.com

**Do NOT apply until the CRM deployment step (launch sequence step 5).**
Nothing here has been changed. All items are owner actions in the
Supabase Dashboard for project `yanasorwmaybnabfuepn`.

Dashboard path: **Authentication → URL Configuration**

## Site URL
Set the Site URL to:

```
https://app.everyrealestatecalculator.com
```

This is the default target for email confirmation and password-recovery
links when the app does not pass an explicit redirect.

## Additional Redirect URLs
Add these (keep the existing localhost entries for local development —
they do not affect production):

```
https://app.everyrealestatecalculator.com/**
https://app.everyrealestatecalculator.com/index.html
http://localhost:5500/index.html        (keep — local development)
http://localhost:5500/**                (keep if present — local development)
```

Why these are needed:
- **Sign up / email confirmation:** Supabase emails a confirmation link
  that returns the user to the app origin; without the production origin
  in the allow list, the return is refused or falls back to localhost.
- **Password recovery:** the CRM gate requests recovery with a return to
  the app (its own origin); the allow list must contain the production
  origin or recovery links break.
- **OAuth (Google/Facebook) sign-in:** providers return to the Supabase
  callback, which then redirects to the app origin — same allow list.

## Providers (no changes expected)
- Email provider: leave as-is.
- Google / Facebook: their consoles whitelist the Supabase callback URL
  (`https://yanasorwmaybnabfuepn.supabase.co/auth/v1/callback`), which does
  not change. No provider-side change is needed for the new domain.

## Verification after applying (owner)
1. Create a test account on the live subdomain; confirm the confirmation
   email link lands back on `app.everyrealestatecalculator.com`.
2. Request a password reset; confirm the recovery link opens the app's
   recovery flow on the subdomain.
3. Sign in with email/password and with Google (if enabled).

Production login status until the above is done and verified: **PENDING**.
