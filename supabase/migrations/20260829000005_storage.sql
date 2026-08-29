-- ============================================================
-- AKPC Material Register
-- Migration 0005: private Storage for challan documents
--
-- A single PRIVATE bucket holds challan photos/docs. Clients use
-- signed URLs or authenticated downloads (design.md §11, §22).
-- The service-role key is NEVER used in the browser.
-- ============================================================

-- create the private bucket (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'challans',
  'challans',
  false,
  10485760, -- 10 MB
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do nothing;

-- ---- storage policies --------------------------------------

-- Any authenticated user may read (view/download) challans.
-- Signing is done app-side; this gates raw reads to authenticated users.
drop policy if exists challans_select on storage.objects;
create policy challans_select on storage.objects
  for select to authenticated
  using (bucket_id = 'challans');

-- Authenticated admin + operator may upload challans.
create or replace function public.can_upload_challan()
returns boolean
language sql
security definer set search_path = public
as $$
  select public.current_role() in ('admin', 'operator');
$$;

drop policy if exists challans_insert on storage.objects;
create policy challans_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'challans'
    and public.can_upload_challan()
  );

-- A user may update (replace) files they uploaded; admin may update any.
drop policy if exists challans_update_owner on storage.objects;
create policy challans_update_owner on storage.objects
  for update to authenticated
  using (
    bucket_id = 'challans'
    and owner = auth.uid()
  )
  with check (bucket_id = 'challans');

drop policy if exists challans_update_admin on storage.objects;
create policy challans_update_admin on storage.objects
  for update to authenticated
  using (
    bucket_id = 'challans'
    and public.current_role() = 'admin'
  )
  with check (bucket_id = 'challans');

-- Admin may delete/archive stored challans (with care in app logic).
drop policy if exists challans_delete_admin on storage.objects;
create policy challans_delete_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'challans'
    and public.current_role() = 'admin'
  );
