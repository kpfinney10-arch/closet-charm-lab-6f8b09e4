-- Signature type enum
do $$ begin
  create type public.signature_type as enum (
    'pickup_released',
    'driver_received',
    'driver_delivered',
    'dropoff_received'
  );
exception when duplicate_object then null; end $$;

-- Add 'signature_captured' to case_event_type if not present
do $$ begin
  alter type public.case_event_type add value if not exists 'signature_captured';
exception when others then null; end $$;

create table if not exists public.case_signatures (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  signature_type public.signature_type not null,
  signer_name text not null,
  signer_title text,
  signature_data text not null, -- data URL (image/png base64)
  lat double precision,
  lng double precision,
  captured_by uuid,
  created_at timestamp with time zone not null default now(),
  unique (case_id, signature_type)
);

create index if not exists case_signatures_case_id_idx on public.case_signatures(case_id);

alter table public.case_signatures enable row level security;

drop policy if exists case_signatures_select_staff on public.case_signatures;
create policy case_signatures_select_staff
  on public.case_signatures for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin'::app_role,'dispatcher'::app_role,'viewer'::app_role]));

drop policy if exists case_signatures_select_driver on public.case_signatures;
create policy case_signatures_select_driver
  on public.case_signatures for select to authenticated
  using (public.has_role(auth.uid(),'driver'::app_role) and public.is_case_driver(auth.uid(), case_id));

drop policy if exists case_signatures_insert_driver on public.case_signatures;
create policy case_signatures_insert_driver
  on public.case_signatures for insert to authenticated
  with check (public.has_role(auth.uid(),'driver'::app_role) and public.is_case_driver(auth.uid(), case_id));

drop policy if exists case_signatures_insert_staff on public.case_signatures;
create policy case_signatures_insert_staff
  on public.case_signatures for insert to authenticated
  with check (public.has_any_role(auth.uid(), array['admin'::app_role,'dispatcher'::app_role]));

drop policy if exists case_signatures_delete_admin on public.case_signatures;
create policy case_signatures_delete_admin
  on public.case_signatures for delete to authenticated
  using (public.has_role(auth.uid(),'admin'::app_role));
