# Staging RLS Tests

These tests sign in as real Supabase users and exercise every Row-Level
Security policy + trigger that protects sensitive data (cases, profiles,
user_roles, signatures, documents). Run them against a **staging** Supabase
project — never production.

## One-time setup

1. Create a separate Supabase project for staging at https://supabase.com/dashboard.
2. Apply this project's migrations to it:
   ```bash
   npx supabase link --project-ref <staging-ref>
   npx supabase db push
   ```
3. Seed shared lookup data (facilities, vehicles):
   ```bash
   psql "$STAGING_DB_URL" -f supabase/seed-staging.sql
   ```
   (or paste the file into the staging SQL editor). Re-runnable.
4. Create `tests/.env` (gitignored via `.env*`):

   ```bash
   STAGING_SUPABASE_URL=https://YOUR-STAGING-REF.supabase.co
   STAGING_SUPABASE_PUBLISHABLE_KEY=eyJ...        # publishable / anon key
   STAGING_SUPABASE_SERVICE_ROLE_KEY=eyJ...       # service role key (server-only)
   ```

   The setup file refuses to run if `STAGING_SUPABASE_URL` points at the live
   project ref.

5. Install deps if you haven't: `bun install`.


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

## What's covered

`tests/rls/cases.test.ts`
- `cases`: anon blocked; driver sees only assigned; dispatcher sees all.
- `restrict_driver_case_updates` trigger: backward/skipped transitions rejected; forward allowed; protected field edits rejected.
- `restrict_profile_updates` trigger: non-admin cannot self-approve or edit other profiles.
- `user_roles`: driver cannot self-grant admin.

`tests/rls/case-children.test.ts`
- `case_events`, `case_signatures`, `case_documents`: visibility scoped to assigned driver / staff; viewer read-only; unassigned drivers + viewers cannot insert; only admin can delete.
- `driver_locations`: own-row read/write; dispatcher can read all; cannot insert for another user.
- `push_subscriptions`: per-user isolation; dispatcher can read all; cannot subscribe on someone else's behalf.
- `admin_audit_logs`: admin-only read; non-admin insert rejected.
- `case-documents` storage bucket: anon cannot download; signed URL flow works for service-role.

