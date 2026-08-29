-- ============================================================
-- AKPC Material Register
-- Migration 0001: profiles (links Supabase Auth users to app profiles)
-- ============================================================

-- Role enum: v1 keeps it simple (admin / operator / viewer)
do $$
begin
  create type public.app_role as enum ('admin', 'operator', 'viewer');
exception
  when duplicate_object then null;
end $$;

-- profiles: one row per auth user
-- IMPORTANT: new users default to 'operator'. They are NEVER auto-assigned
-- admin. The first/admin account is explicitly promoted via a manual step
-- (e.g. UPDATE profiles SET role='admin' WHERE id=<uid>). See 0004_rls.sql
-- which prevents a user from changing their own role.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  role        public.app_role not null default 'operator',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- auto-maintain updated_at on profiles
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- auto-create a profile row when a new auth user signs up.
-- New signups default to role = 'operator' (schema default). They are
-- never auto-promoted to admin. The first/admin account is promoted
-- manually afterwards.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, 'User')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- profiles.id is permanently bound to the auth user id. An UPDATE must
-- never change it (keeps the auth.users <-> profiles identity intact).
create function public.profiles_prevent_id_change()
returns trigger
language plpgsql
as $$
begin
  if old.id is distinct from new.id then
    raise exception 'profile id cannot be changed; it is bound to the auth user id';
  end if;
  return new;
end;
$$;

create trigger profiles_no_id_change
  before update on public.profiles
  for each row
  execute function public.profiles_prevent_id_change();
