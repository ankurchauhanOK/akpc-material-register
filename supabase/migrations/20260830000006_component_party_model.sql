-- ============================================================
-- AKPC Material Register
-- Migration 0006: Component + Party model (incremental, non-destructive)
--
-- Evolves the existing production tables IN PLACE (no physical
-- renames) so existing data and meanings are preserved:
--   materials    -> Component Master semantics
--   companies    -> Party Master semantics
--   transactions -> transaction ledger (component + party + snapshot)
--
-- New controlled enums are introduced (extensible, no free-text):
--   unit_type            (pieces, kg, meter, litre, set)
--   component_category   (direct, indirect)
--   party_role           (customer, supplier, both)
--
-- Backfill rules (historical-correctness-first):
--   * materials.category  -> NULL (PENDING classification) — never assumed
--   * companies.role      -> inferred from transaction history, else NULL
--   * transactions snapshot cols <- copied from linked company at migration
--   * existing challan_path is preserved as LEGACY external doc; a new
--     external_document_path column is added for future uploads. Old
--     challan_path is NOT dropped (removed later, only after verification).
--   * part_code stays NULL/PENDING — NO auto-assignment trigger. Official
--     codes (DM0001/IDM0001) are a future, deliberately-defined process.
--
-- This migration is additive / non-destructive.
-- ============================================================

-- ------------------------------------------------------------
-- 1. New controlled enums (extensible, idempotent)
-- ------------------------------------------------------------
do $$ begin
  create type public.unit_type as enum ('pieces', 'kg', 'meter', 'litre', 'set');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.component_category as enum ('direct', 'indirect');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.party_role as enum ('customer', 'supplier', 'both');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2. Evolve materials -> Component Master (table name kept)
--    unit: controlled enum, default 'pieces'
--    category: NULL means PENDING classification (manual later)
--    part_code: NULL/PENDING; no auto-assignment trigger by design
-- ------------------------------------------------------------
alter table public.materials
  add column if not exists unit      public.unit_type not null default 'pieces';
alter table public.materials
  add column if not exists category  public.component_category;
alter table public.materials
  add column if not exists part_code text;

-- ------------------------------------------------------------
-- 3. Evolve companies -> Party Master (table name kept)
--    role: NULL = unclassified; inferred from history, or manual
-- ------------------------------------------------------------
alter table public.companies
  add column if not exists location text;
alter table public.companies
  add column if not exists post     text;
alter table public.companies
  add column if not exists contact  text;
alter table public.companies
  add column if not exists pincode  text;
alter table public.companies
  add column if not exists role     public.party_role;

-- ------------------------------------------------------------
-- 4. Evolve transactions:
--    - pricing: preserve BOTH unit_price and total_amount (never overwrite)
--    - challan_number: source challan no. (Receive)
--    - external_document_path: optional supporting doc (future uploads);
--      existing challan_path remains LEGACY and is preserved
--    - party snapshot: 6 nullable cols frozen at write time
-- ------------------------------------------------------------
alter table public.transactions
  add column if not exists unit_price         numeric(14,2);
alter table public.transactions
  add column if not exists challan_number     text;
alter table public.transactions
  add column if not exists external_document_path text;
alter table public.transactions
  add column if not exists party_name         text;
alter table public.transactions
  add column if not exists party_company      text;
alter table public.transactions
  add column if not exists party_location     text;
alter table public.transactions
  add column if not exists party_post         text;
alter table public.transactions
  add column if not exists party_contact      text;
alter table public.transactions
  add column if not exists party_pincode      text;

-- new indexes for the component/party doc search paths
create index if not exists transactions_unit_price_idx on public.transactions (unit_price);
create index if not exists transactions_external_doc_idx on public.transactions (external_document_path) where external_document_path is not null;
create index if not exists transactions_component_date_idx on public.transactions (material_id, transaction_date desc);
create index if not exists transactions_party_date_idx on public.transactions (company_id, transaction_date desc);

-- ------------------------------------------------------------
-- 5. New join table: component_parties (MASTER relationship only —
--    NOT the source of transaction history)
-- ------------------------------------------------------------
create table if not exists public.component_parties (
  id           uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.materials (id) on delete cascade,
  party_id     uuid not null references public.companies (id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (component_id, party_id)
);

create index if not exists component_parties_component_idx on public.component_parties (component_id);
create index if not exists component_parties_party_idx on public.component_parties (party_id);

-- ------------------------------------------------------------
-- 6. BACKFILL (non-destructive)
-- ------------------------------------------------------------

-- 6a. Existing materials already have unit='pieces' default; leave
--     category NULL (Pending) and part_code NULL. Nothing to do here.

-- 6b. Infer company role from existing transaction history.
--     Only on RECEIVE -> supplier; only on SEND/GIVEN -> customer;
--     both -> both; no history -> NULL (unclassified).
update public.companies c
set role = inferred.role
from (
  select
    company_id,
    case
      when count(*) filter (where type = 'received') > 0
       and count(*) filter (where type = 'given')    = 0 then 'supplier'::public.party_role
      when count(*) filter (where type = 'given')    > 0
       and count(*) filter (where type = 'received') = 0 then 'customer'::public.party_role
      when count(*) filter (where type = 'received') > 0
       and count(*) filter (where type = 'given')    > 0 then 'both'::public.party_role
      else null
    end as role
  from public.transactions
  where deleted_at is null
  group by company_id
) inferred
where c.id = inferred.company_id
  and c.role is null;

-- 6c. Snapshot existing party details onto transactions at migration
--     time so historical records are frozen and remain readable even
--     after a party's master profile later changes.
update public.transactions t
set
  party_name     = c.name,
  party_company  = c.name,        -- legacy companies have no distinct company/party; keep readable
  party_location = c.location,
  party_post     = c.post,
  party_contact  = c.contact,
  party_pincode  = c.pincode
from public.companies c
where t.company_id = c.id
  and t.party_name is null;

-- 6d. Legacy challan_path: existing uploads are preserved as-is. They
--     remain readable via challan_path (LEGACY). We do NOT copy them
--     into external_document_path in this migration to avoid duplicating
--     paths; the app treats challan_path as the legacy attachment source
--     and external_document_path as the new one. Old column left intact.

-- 6e. Build component_parties from distinct (component, party) pairs
--     that already exist in the transaction history.
insert into public.component_parties (component_id, party_id)
select distinct material_id, company_id
from public.transactions
where deleted_at is null
  and material_id is not null
  and company_id is not null
on conflict (component_id, party_id) do nothing;

-- ------------------------------------------------------------
-- 7. RLS for component_parties (mirror existing role model)
-- ------------------------------------------------------------
alter table public.component_parties enable row level security;

drop policy if exists component_parties_select on public.component_parties;
create policy component_parties_select on public.component_parties
  for select to authenticated using (true);

drop policy if exists component_parties_insert on public.component_parties;
create policy component_parties_insert on public.component_parties
  for insert to authenticated
  with check (public.current_role() in ('admin', 'operator'));

drop policy if exists component_parties_delete on public.component_parties;
create policy component_parties_delete on public.component_parties
  for delete to authenticated
  using (public.current_role() = 'admin');
