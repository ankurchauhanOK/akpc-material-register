-- ============================================================
-- AKPC Material Register
-- Migration 0004: Row Level Security (RLS) + role-based policies
--
-- v1 permission model (design.md §19, §21):
--   admin    -> view, create, edit (any, any time), archive, manage users
--               and masters
--   operator -> view, create, edit own records created within the last
--               24 hours, upload challans
--   viewer   -> read-only
--
-- Policies are enforced in the database (not merely by hiding
-- buttons). A helper is_active profile check gates access.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: current user's app role (NULL if not a known profile)
-- ------------------------------------------------------------
create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true
$$;

-- ------------------------------------------------------------
-- PROFILES: users may read only their own profile; admins read all.
-- A user may update their own profile but may NOT change their own
-- role (only admins change roles). Profiles are auto-created via the
-- auth trigger, so there is no direct INSERT policy.
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select using (public.current_role() = 'admin');

-- Admin may update any profile (including changing roles).
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update using (public.current_role() = 'admin')
  with check (true);

-- A user may update only their own profile, and may not change their
-- own role. (Admin changes happen via the admin policy above.)
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
  );

-- ------------------------------------------------------------
-- MATERIALS: anyone authenticated can read; admins/operators write.
-- ------------------------------------------------------------
alter table public.materials enable row level security;

drop policy if exists materials_select on public.materials;
create policy materials_select on public.materials
  for select to authenticated using (true);

drop policy if exists materials_insert on public.materials;
create policy materials_insert on public.materials
  for insert to authenticated
  with check (public.current_role() in ('admin', 'operator'));

drop policy if exists materials_update on public.materials;
create policy materials_update on public.materials
  for update to authenticated
  using (public.current_role() in ('admin', 'operator'))
  with check (public.current_role() in ('admin', 'operator'));

drop policy if exists materials_delete on public.materials;
create policy materials_delete on public.materials
  for delete to authenticated
  using (public.current_role() = 'admin');

-- ------------------------------------------------------------
-- COMPANIES: same model as materials.
-- ------------------------------------------------------------
alter table public.companies enable row level security;

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select to authenticated using (true);

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies
  for insert to authenticated
  with check (public.current_role() in ('admin', 'operator'));

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies
  for update to authenticated
  using (public.current_role() in ('admin', 'operator'))
  with check (public.current_role() in ('admin', 'operator'));

drop policy if exists companies_delete on public.companies;
create policy companies_delete on public.companies
  for delete to authenticated
  using (public.current_role() = 'admin');

-- ------------------------------------------------------------
-- TRANSACTIONS: read for all authenticated.
-- create/edit for admin + operator.
-- soft-delete (archive) for admin only (design.md §20, §22).
-- ------------------------------------------------------------
alter table public.transactions enable row level security;

drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
  for select to authenticated
  using (
    -- hide soft-deleted rows from normal reads
    deleted_at is null
  );

drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (
    public.current_role() in ('admin', 'operator')
    and created_by = auth.uid()
  );

-- operator may edit their own records created within the last 24 hours.
-- (design.md §21 — "recently-created" is defined here as <= 24h old.)
-- Admin edits anything, any time.
drop policy if exists transactions_update_operator on public.transactions;
create policy transactions_update_operator on public.transactions
  for update to authenticated
  using (
    public.current_role() = 'operator'
    and created_by = auth.uid()
    and deleted_at is null
    and created_at >= now() - interval '24 hours'
  )
  with check (
    public.current_role() = 'operator'
    and created_by = auth.uid()
    and deleted_at is null
    and created_at >= now() - interval '24 hours'
  );

drop policy if exists transactions_update_admin on public.transactions;
create policy transactions_update_admin on public.transactions
  for update to authenticated
  using (public.current_role() = 'admin' and deleted_at is null)
  with check (public.current_role() = 'admin');
