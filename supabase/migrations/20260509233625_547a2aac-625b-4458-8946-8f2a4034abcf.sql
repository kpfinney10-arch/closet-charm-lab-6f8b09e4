create type public.admin_audit_action as enum (
  'user_created',
  'user_disabled',
  'user_enabled',
  'user_deleted',
  'role_changed',
  'password_reset'
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action admin_audit_action not null,
  actor_id uuid not null,
  actor_email text,
  target_user_id uuid,
  target_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_logs_created_at_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_actor_idx on public.admin_audit_logs (actor_id);
create index admin_audit_logs_target_idx on public.admin_audit_logs (target_user_id);

alter table public.admin_audit_logs enable row level security;

create policy admin_audit_logs_select_admin
  on public.admin_audit_logs for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy admin_audit_logs_insert_admin
  on public.admin_audit_logs for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
