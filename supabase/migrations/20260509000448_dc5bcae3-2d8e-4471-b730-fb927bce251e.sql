
-- ============================================================
-- ENUMS
-- ============================================================
create type public.app_role as enum ('admin', 'dispatcher', 'driver', 'viewer');

create type public.case_status as enum (
  'new',
  'assigned',
  'en_route_pickup',
  'on_scene',
  'in_custody',
  'en_route_dropoff',
  'delivered',
  'closed',
  'cancelled'
);

create type public.facility_type as enum (
  'hospital',
  'residence',
  'medical_examiner',
  'nursing_home',
  'hospice',
  'funeral_home',
  'crematory',
  'embalmer',
  'other'
);

create type public.case_event_type as enum (
  'created',
  'assigned',
  'status_changed',
  'note_added',
  'document_added',
  'reassigned',
  'cancelled'
);

create type public.document_type as enum (
  'release_form',
  'body_tag',
  'id_photo',
  'signature',
  'other'
);

-- ============================================================
-- PROFILES
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  on_duty boolean not null default false,
  current_vehicle_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ============================================================
-- USER ROLES (separate table — security best practice)
-- ============================================================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- Security definer function to check roles without RLS recursion
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.has_any_role(_user_id uuid, _roles app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = any(_roles)
  )
$$;

-- ============================================================
-- FACILITIES
-- ============================================================
create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type facility_type not null default 'other',
  address text,
  city text,
  state text,
  zip text,
  phone text,
  contact_name text,
  lat double precision,
  lng double precision,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.facilities enable row level security;

-- ============================================================
-- VEHICLES
-- ============================================================
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  license_plate text,
  make text,
  model text,
  year int,
  capacity int default 1,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;

-- Add the deferred FK from profiles -> vehicles
alter table public.profiles
  add constraint profiles_current_vehicle_fk
  foreign key (current_vehicle_id) references public.vehicles(id) on delete set null;

-- ============================================================
-- CASES
-- ============================================================
create sequence if not exists public.case_number_seq start 1000;

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default ('C-' || nextval('public.case_number_seq')::text),
  status case_status not null default 'new',

  -- Decedent
  decedent_first_name text,
  decedent_last_name text not null,
  decedent_dob date,
  decedent_dod timestamptz,
  decedent_sex text,
  decedent_weight_lbs int,
  special_handling text,

  -- Pickup
  pickup_facility_id uuid references public.facilities(id) on delete set null,
  pickup_address text,
  pickup_city text,
  pickup_state text,
  pickup_zip text,
  pickup_contact_name text,
  pickup_contact_phone text,
  pickup_notes text,
  pickup_lat double precision,
  pickup_lng double precision,

  -- Dropoff
  dropoff_facility_id uuid references public.facilities(id) on delete set null,
  dropoff_address text,
  dropoff_city text,
  dropoff_state text,
  dropoff_zip text,
  dropoff_notes text,
  dropoff_lat double precision,
  dropoff_lng double precision,

  -- Authorizing party / next of kin
  authorizing_party_name text,
  authorizing_party_relation text,
  authorizing_party_phone text,

  -- Assignment
  primary_driver_id uuid references auth.users(id) on delete set null,
  secondary_driver_id uuid references auth.users(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  scheduled_at timestamptz,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cases enable row level security;

create index cases_status_idx on public.cases(status);
create index cases_primary_driver_idx on public.cases(primary_driver_id);
create index cases_secondary_driver_idx on public.cases(secondary_driver_id);
create index cases_created_at_idx on public.cases(created_at desc);

-- Helper: is the current user assigned to this case?
create or replace function public.is_case_driver(_user_id uuid, _case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cases
    where id = _case_id
      and (primary_driver_id = _user_id or secondary_driver_id = _user_id)
  )
$$;

-- ============================================================
-- CASE EVENTS (chain of custody / audit log)
-- ============================================================
create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  event_type case_event_type not null,
  from_status case_status,
  to_status case_status,
  actor_id uuid references auth.users(id) on delete set null,
  lat double precision,
  lng double precision,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.case_events enable row level security;

create index case_events_case_id_idx on public.case_events(case_id, created_at desc);

-- ============================================================
-- CASE DOCUMENTS
-- ============================================================
create table public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  doc_type document_type not null default 'other',
  file_path text not null,
  caption text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.case_documents enable row level security;

create index case_documents_case_id_idx on public.case_documents(case_id);

-- ============================================================
-- DRIVER LOCATIONS (live tracking)
-- ============================================================
create table public.driver_locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  speed double precision,
  accuracy double precision,
  updated_at timestamptz not null default now()
);

alter table public.driver_locations enable row level security;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger facilities_set_updated_at
  before update on public.facilities
  for each row execute function public.set_updated_at();

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

create trigger cases_set_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-log case creation
create or replace function public.log_case_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.case_events (case_id, event_type, to_status, actor_id, notes)
  values (new.id, 'created', new.status, new.created_by, 'Case created');
  return new;
end;
$$;

create trigger cases_log_created
  after insert on public.cases
  for each row execute function public.log_case_created();

-- Auto-log status changes
create or replace function public.log_case_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.case_events (case_id, event_type, from_status, to_status, actor_id)
    values (new.id, 'status_changed', old.status, new.status, auth.uid());
  end if;

  if new.primary_driver_id is distinct from old.primary_driver_id
     or new.secondary_driver_id is distinct from old.secondary_driver_id then
    insert into public.case_events (case_id, event_type, actor_id, notes)
    values (
      new.id,
      case when old.primary_driver_id is null and old.secondary_driver_id is null
           then 'assigned'::case_event_type
           else 'reassigned'::case_event_type end,
      auth.uid(),
      'Driver assignment changed'
    );
  end if;

  return new;
end;
$$;

create trigger cases_log_status_change
  after update on public.cases
  for each row execute function public.log_case_status_change();

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- PROFILES: anyone signed in can read; users update their own; admins update any
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- USER_ROLES: users see their own roles; admins see and manage all
create policy "user_roles_select_own"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_roles_select_admin"
  on public.user_roles for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "user_roles_insert_admin"
  on public.user_roles for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

create policy "user_roles_delete_admin"
  on public.user_roles for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- FACILITIES: all signed-in users read; admins/dispatchers manage
create policy "facilities_select_authenticated"
  on public.facilities for select
  to authenticated
  using (true);

create policy "facilities_modify_staff"
  on public.facilities for all
  to authenticated
  using (public.has_any_role(auth.uid(), array['admin','dispatcher']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','dispatcher']::app_role[]));

-- VEHICLES: all signed-in read; admins/dispatchers manage
create policy "vehicles_select_authenticated"
  on public.vehicles for select
  to authenticated
  using (true);

create policy "vehicles_modify_staff"
  on public.vehicles for all
  to authenticated
  using (public.has_any_role(auth.uid(), array['admin','dispatcher']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','dispatcher']::app_role[]));

-- CASES: dispatchers/admins see all; drivers see only their assigned cases; viewers read all
create policy "cases_select_staff"
  on public.cases for select
  to authenticated
  using (public.has_any_role(auth.uid(), array['admin','dispatcher','viewer']::app_role[]));

create policy "cases_select_assigned_driver"
  on public.cases for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'driver')
    and (primary_driver_id = auth.uid() or secondary_driver_id = auth.uid())
  );

create policy "cases_insert_dispatcher"
  on public.cases for insert
  to authenticated
  with check (public.has_any_role(auth.uid(), array['admin','dispatcher']::app_role[]));

create policy "cases_update_dispatcher"
  on public.cases for update
  to authenticated
  using (public.has_any_role(auth.uid(), array['admin','dispatcher']::app_role[]));

create policy "cases_update_assigned_driver"
  on public.cases for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'driver')
    and (primary_driver_id = auth.uid() or secondary_driver_id = auth.uid())
  );

create policy "cases_delete_admin"
  on public.cases for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- CASE EVENTS: visible to anyone who can see the case; insert from anyone who can edit
create policy "case_events_select_staff"
  on public.case_events for select
  to authenticated
  using (public.has_any_role(auth.uid(), array['admin','dispatcher','viewer']::app_role[]));

create policy "case_events_select_driver"
  on public.case_events for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'driver')
    and public.is_case_driver(auth.uid(), case_id)
  );

create policy "case_events_insert_staff"
  on public.case_events for insert
  to authenticated
  with check (public.has_any_role(auth.uid(), array['admin','dispatcher']::app_role[]));

create policy "case_events_insert_driver"
  on public.case_events for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'driver')
    and public.is_case_driver(auth.uid(), case_id)
  );

-- CASE DOCUMENTS: same visibility model as case events
create policy "case_documents_select_staff"
  on public.case_documents for select
  to authenticated
  using (public.has_any_role(auth.uid(), array['admin','dispatcher','viewer']::app_role[]));

create policy "case_documents_select_driver"
  on public.case_documents for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'driver')
    and public.is_case_driver(auth.uid(), case_id)
  );

create policy "case_documents_insert_staff"
  on public.case_documents for insert
  to authenticated
  with check (public.has_any_role(auth.uid(), array['admin','dispatcher']::app_role[]));

create policy "case_documents_insert_driver"
  on public.case_documents for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'driver')
    and public.is_case_driver(auth.uid(), case_id)
  );

create policy "case_documents_delete_admin"
  on public.case_documents for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- DRIVER LOCATIONS: drivers write their own; admins/dispatchers read all
create policy "driver_locations_select_staff"
  on public.driver_locations for select
  to authenticated
  using (public.has_any_role(auth.uid(), array['admin','dispatcher','viewer']::app_role[]));

create policy "driver_locations_select_own"
  on public.driver_locations for select
  to authenticated
  using (user_id = auth.uid());

create policy "driver_locations_upsert_own"
  on public.driver_locations for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "driver_locations_update_own"
  on public.driver_locations for update
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- STORAGE BUCKET for case documents (private)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;

-- Storage RLS: anyone signed-in with case visibility can read; staff & assigned drivers can upload
create policy "case_docs_select_staff"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'case-documents'
    and public.has_any_role(auth.uid(), array['admin','dispatcher','viewer','driver']::app_role[])
  );

create policy "case_docs_insert_staff"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'case-documents'
    and public.has_any_role(auth.uid(), array['admin','dispatcher','driver']::app_role[])
  );

create policy "case_docs_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'case-documents'
    and public.has_role(auth.uid(), 'admin')
  );

-- ============================================================
-- REALTIME
-- ============================================================
alter publication supabase_realtime add table public.cases;
alter publication supabase_realtime add table public.case_events;
alter publication supabase_realtime add table public.driver_locations;
alter publication supabase_realtime add table public.profiles;
