# Staging RLS Tests

These tests sign in as real Supabase users and exercise every Row-Level
Security policy + trigger that protects sensitive data (cases, profiles,
user_roles, signatures, documents). Run them against a **staging** Supabase
project — never production.

## One-time setup

1. Create a separate Supabase project for staging (or use an existing
   non-production one). Apply the same migrations as production.
2. Create `tests/.env` (already gitignored via the project's `.env*` rules —
   do not commit it):

   ```bash
   STAGING_SUPABASE_URL=https://YOUR-STAGING-REF.supabase.co
   STAGING_SUPABASE_PUBLISHABLE_KEY=eyJ...        # publishable / anon key
   STAGING_SUPABASE_SERVICE_ROLE_KEY=eyJ...       # service role key (server-only)
   ```

   The setup file refuses to run if `STAGING_SUPABASE_URL` points at the live
   project ref.

3. Install deps if you haven't: `bun install`.

## Run

```bash
bunx vitest run tests/rls
```

The suite seeds test users (`rls-driver-a@test.local`, etc.) and `TEST-*`
cases via the service-role client, exercises the policies as each role, then
tears the fixtures down.

## What's covered today

- `cases`: anon blocked; driver sees only assigned cases; dispatcher sees all.
- `cases` driver trigger: backward / skipped transitions rejected; allowed
  forward transition accepted; edits to protected fields rejected.
- `profiles` trigger: non-admin cannot self-approve or edit other profiles.
- `user_roles`: driver cannot self-grant admin.

## What's still TODO

These follow the same pattern — add as time allows:

- `case_events`, `case_signatures`, `case_documents` visibility per role.
- `driver_locations` insert/select scoping.
- `push_subscriptions` per-user isolation.
- `admin_audit_logs` admin-only read.
- Signed URL access for the `case-documents` bucket per case authorization.
