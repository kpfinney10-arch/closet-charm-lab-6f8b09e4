
-- Set search_path on set_updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Revoke EXECUTE from public/authenticated on trigger-only functions
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_case_created() from public, anon, authenticated;
revoke execute on function public.log_case_status_change() from public, anon, authenticated;

-- Restrict role-check helpers to authenticated users (they're used in policies)
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.has_any_role(uuid, public.app_role[]) from public, anon;
revoke execute on function public.is_case_driver(uuid, uuid) from public, anon;
