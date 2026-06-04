# Resend / Supabase auth email templates

These four HTML files are the **source of truth** for the brand-matched auth emails sent by Supabase Auth → Resend SMTP. Edit here; copy into the Supabase dashboard to deploy.

## Files

| File | Supabase template | When fired |
|---|---|---|
| `confirm-signup.html` | **Confirm signup** | After `auth.signUp()` — contains the 6-digit code |
| `reset-password.html` | **Reset password** | After `auth.resetPasswordForEmail()` |
| `magic-link.html` | **Magic link** | After `auth.signInWithOtp()` (passwordless) |
| `change-email.html` | **Change email** | After `auth.updateUser({ email })` |

## How to deploy a template

1. Open the Supabase dashboard → **Auth → Email templates**.
2. Pick the template matching the file above.
3. Open the corresponding `.html` file from this directory.
4. Copy the entire file contents.
5. Paste into the dashboard's HTML body editor.
6. Click **Save**.

Changes propagate immediately. Test by triggering the flow (sign up with a fresh email, request a password reset, etc.).

## Required Supabase config — one-time

1. **Auth → SMTP Settings** — point Supabase at Resend so the emails come from `@autonomux.io` instead of `noreply@mail.app.supabase.io`:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: your Resend API key (`re_…`)
   - Sender email: `auth@autonomux.io` (or `hello@autonomux.io`)
   - Sender name: `autonomux`
2. **Auth → Email templates → Confirm signup** — make sure the body contains `{{ .Token }}` (the 6-digit code). The default template only uses `{{ .ConfirmationURL }}`. Our template uses both.

## Supabase template variables

Inside the HTML the Supabase template engine substitutes:

- `{{ .Token }}` — the 6-digit OTP (signup, magic-link)
- `{{ .ConfirmationURL }}` — the verified link
- `{{ .SiteURL }}` — your configured site URL
- `{{ .Email }}` — the user's email
- `{{ .NewEmail }}` — the new email (change-email template only)
- `{{ .RedirectTo }}` — the redirect URL set by the action

## Design tokens used (for parity with the in-app design)

- Brand orange: `#f26b1a`
- Deep red: `#b81f00`
- Wine: `#7a2010`
- Cream: `#fff8f3`
- Page background: `#f6f0e6`
- Card border: `#ece3d6`
- Ink: `#1a1410`
- Muted: `#6b5f54`

Fonts inline use system fallbacks for email-client compatibility — Cormorant Garamond loads where supported (some clients won't honor it) and falls back to Georgia.

## Editing

- Keep tables-for-layout. Email clients (Outlook, Apple Mail) still don't render CSS Grid / Flexbox reliably.
- Inline every style. `<style>` blocks are stripped by Gmail.
- Preheader text (the hidden one-liner at the top) shows in inbox previews — keep it benign and informative.
- Test in Litmus / Email on Acid before any major change.
