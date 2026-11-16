# Localized authentication emails

These are reviewable, seven-language **Supabase Dashboard templates**, not an
automatically applied Auth configuration. No hosted email was sent or changed.

In the existing project's Authentication > Email Templates, review and copy
`confirm-signup.html` into **Confirm signup** and `reset-password.html` into
**Reset password**. Keep the project's existing SMTP settings, URL allowlist,
confirmation policy and recovery behavior. The CTA uses Supabase's generated
`{{ .ConfirmationURL }}`; it introduces no callback hostname or local URL.

Both templates select the allowlisted language from
`.Data.crm_preferences.language`, falling back to English. The application
includes that presentation metadata during signup and saves it for authenticated
users. Existing accounts without metadata receive English. Arabic uses `dir=rtl`.
No business record, authorization claim, user-supplied HTML or credential is
rendered. The same language should be used in the email subject; configure a
reviewed conditional subject in the Dashboard if supported by the project's mail
provider, or keep a neutral `RealtorCRM` subject. OAuth provider-owned emails
cannot be translated by this repository.

Before release, use synthetic staging accounts in each language to test delivered
HTML, subjects, expiration, confirmation, recovery and the redirect allowlist.
Test missing metadata as well. Dashboard template parsing and actual email client
rendering remain external verification requirements. A local HTML preview cannot
prove hosted template execution or delivery.

Reference: [Supabase Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
