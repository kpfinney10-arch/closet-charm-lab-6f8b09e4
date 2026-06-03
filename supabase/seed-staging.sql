-- Staging seed for RLS tests and manual smoke-testing.
--
-- Apply this to a STAGING Supabase project (not production) AFTER running
-- `supabase db push` so all migrations are in place. Re-runnable: every
-- statement is idempotent and scoped to the TEST-SEED-* namespace.
--
-- Usage from project root, with the staging project linked:
--   psql "$STAGING_DB_URL" -f supabase/seed-staging.sql
-- or paste into the staging SQL editor.

begin;

-- Facilities --------------------------------------------------------------
insert into public.facilities (id, name, kind, address, city, state, zip)
values
  ('11111111-1111-1111-1111-111111111111', 'TEST-SEED Memorial Hospital', 'hospital', '100 Test Way', 'Stagetown', 'PA', '19000'),
  ('22222222-2222-2222-2222-222222222222', 'TEST-SEED Funeral Home', 'funeral_home', '200 Test Ave', 'Stagetown', 'PA', '19000')
on conflict (id) do update
  set name = excluded.name,
      kind = excluded.kind,
      address = excluded.address,
      city = excluded.city,
      state = excluded.state,
      zip = excluded.zip;

-- Vehicles ----------------------------------------------------------------
insert into public.vehicles (id, name, plate, active)
values
  ('33333333-3333-3333-3333-333333333333', 'TEST-SEED Van 1', 'STG-001', true)
on conflict (id) do update
  set name = excluded.name,
      plate = excluded.plate,
      active = excluded.active;

-- NOTE: auth users (rls-driver-a@test.local, etc.) and their case fixtures
-- are created by the RLS test suite itself via the service-role client.
-- This file only seeds shared lookup data (facilities, vehicles) that the
-- suite expects to exist but does not manage.

commit;

-- Sanity check (run manually after seeding):
--   select count(*) from public.facilities where name like 'TEST-SEED%';
--   select count(*) from public.vehicles  where name like 'TEST-SEED%';
