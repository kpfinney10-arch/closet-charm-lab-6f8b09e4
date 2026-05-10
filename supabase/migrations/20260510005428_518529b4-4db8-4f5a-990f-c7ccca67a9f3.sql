-- Web Push subscriptions: one row per browser/device a driver has opted in from
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (user_id, endpoint)
);

create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- A user can manage only their own subscriptions
create policy push_subscriptions_select_own
on public.push_subscriptions for select to authenticated
using (user_id = auth.uid());

create policy push_subscriptions_insert_own
on public.push_subscriptions for insert to authenticated
with check (user_id = auth.uid());

create policy push_subscriptions_update_own
on public.push_subscriptions for update to authenticated
using (user_id = auth.uid());

create policy push_subscriptions_delete_own
on public.push_subscriptions for delete to authenticated
using (user_id = auth.uid());

-- Dispatchers/admins need to read driver subscriptions to send pushes.
-- (Sends actually happen server-side with the service role, but this lets
-- dispatchers see "driver has notifications on" if we add that UI later.)
create policy push_subscriptions_select_staff
on public.push_subscriptions for select to authenticated
using (has_any_role(auth.uid(), array['admin'::app_role, 'dispatcher'::app_role]));

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();