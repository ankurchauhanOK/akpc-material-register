-- ============================================================
-- AKPC Material Register
-- Migration 0007: Receiving document + line-item model
--
-- Introduces a genuine ONE receiving document -> MANY line items
-- model for Receive. This is a foundation change (v2 model):
--
--   one transaction = one item         (old, kept for Send now)
--   one document -> many items         (new, for Receive)
--
-- Design:
--   receiving_documents                document header
--     - ONE business-facing document_number (REC-xxxxxx / GIV-xxxxxx)
--     - type / kind / source / payment_status / party / date / challan
--     - document financial totals (subtotal, gst_total, total_amount)
--     - party snapshot (frozen at write time, like transactions)
--     - audit + soft-delete (deleted_at)
--   receiving_document_items           line items (1 -> many)
--     - line_no (sequential within a document)
--     - line_type: component | other   (master vs ad-hoc, never mixed)
--     - component_id -> materials (NULL for 'other')
--     - item_name (required historical snapshot)
--     - quantity / unit / unit_price / gst_percent
--     - subtotal / gst_amount / line_total (incl. GST)
--
-- Numbering: ONE server-generated, unique, collision-free document_number
-- per document, reusing the existing generate_transaction_number() +
-- txn_seq_REC/txn_seq_GIV (shared with legacy transactions, so the series
-- stays non-colliding across both models). Numbers are NOT guaranteed
-- contiguous -- gaps from aborted/cancelled inserts are acceptable.
-- Line items carry only their internal UUID id + line_no.
--
-- Send is NOT changed in this migration. The document tables are
-- type-aware (type reuses transaction_type) so Send can become
-- multi-item later via the same document/item tables with type='given'
-- without another schema redesign.
--
-- This migration is additive / non-destructive. Existing transactions
-- rows are NOT backfilled into the new tables and remain readable.
--
-- NOTE (review pending): created for approval. DO NOT apply/push.
-- ============================================================

-- ------------------------------------------------------------
-- 1. New enums (extensible, idempotent — same pattern as 0006/0003)
-- ------------------------------------------------------------
do $$ begin
  create type public.document_source as enum ('supplier', 'shop');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_kind as enum ('raw-material', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_line_type as enum ('component', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.receiving_document_status as enum ('completed', 'cancelled');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2. receiving_documents — the document header (1 per document)
-- ------------------------------------------------------------
create table if not exists public.receiving_documents (
  id                    uuid primary key default gen_random_uuid(),
  document_number       text not null,
  type                  public.transaction_type not null,
  kind                  public.document_kind not null,
  source                public.document_source not null,
  status                public.receiving_document_status not null default 'completed',
  -- payment_status is shop-only, so it is nullable and set only when
  -- source = 'shop' (no irrelevant financial state for supplier receipt).
  payment_status        public.payment_status,
  company_id            uuid not null references public.companies (id),
  transaction_date      date not null default current_date,
  -- supplier-mode fields
  challan_number        text,
  vehicle_details       text,
  -- optional supporting document (the supplier's original challan —
  -- distinct from a future AKPC-generated Send challan)
  external_document_path text,
  -- party snapshot frozen at write time (historical correctness)
  party_name            text,
  party_company         text,
  party_location        text,
  party_post            text,
  party_contact         text,
  party_pincode         text,
  -- document financial totals
  subtotal              numeric(14,2) not null default 0 check (subtotal >= 0),
  gst_total             numeric(14,2) not null default 0 check (gst_total >= 0),
  total_amount          numeric(14,2) not null default 0 check (total_amount >= 0),
  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

-- unique document numbers (applied via insert trigger)
create unique index if not exists receiving_documents_number_uidx
  on public.receiving_documents (document_number);

-- indexes for the search / filter / cross-check paths
create index if not exists receiving_documents_date_idx
  on public.receiving_documents (transaction_date);
create index if not exists receiving_documents_type_idx
  on public.receiving_documents (type);
create index if not exists receiving_documents_source_idx
  on public.receiving_documents (source);
create index if not exists receiving_documents_company_idx
  on public.receiving_documents (company_id);
create index if not exists receiving_documents_active_idx
  on public.receiving_documents (deleted_at) where deleted_at is null;

create index if not exists receiving_documents_active_status_idx
  on public.receiving_documents (status, transaction_date)
  where deleted_at is null;

create trigger receiving_documents_set_updated_at
  before update on public.receiving_documents
  for each row
  execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. receiving_document_items — the line items (1 -> many)
-- ------------------------------------------------------------
create table if not exists public.receiving_document_items (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.receiving_documents (id),
  line_no       integer not null check (line_no >= 1),
  -- component | other — master vs ad-hoc, always distinguishable
  line_type     public.document_line_type not null,
  -- NULL when line_type = 'other'; ad-hoc items never fake a master
  component_id  uuid references public.materials (id),
  -- required historical snapshot of the display name
  item_name     text not null,
  quantity      numeric(14,4) not null check (quantity > 0),
  unit          public.unit_type not null,
  unit_price    numeric(14,2) check (unit_price >= 0),
  gst_percent   numeric(5,2) not null default 0 check (gst_percent >= 0),
  -- financial calculation per line
  subtotal      numeric(14,2) not null default 0 check (subtotal >= 0),
  gst_amount    numeric(14,2) not null default 0 check (gst_amount >= 0),
  line_total    numeric(14,2) not null default 0 check (line_total >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists receiving_document_items_document_line_uidx
  on public.receiving_document_items (document_id, line_no);
create index if not exists receiving_document_items_component_idx
  on public.receiving_document_items (component_id);

create trigger receiving_document_items_set_updated_at
  before update on public.receiving_document_items
  for each row
  execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 4. Document number generation (ONE number per document)
--
-- Reuses the existing generate_transaction_number() + sequences so
-- Receive and future Send documents share the same monotonic REC/GIV
-- series. The number is always server-generated; the client's value is
-- ignored/overwritten (same anti-forgery rule as transactions).
-- ------------------------------------------------------------
create function public.receiving_documents_assign_number()
returns trigger
language plpgsql
as $$
begin
  new.document_number := public.generate_transaction_number(new.type);
  return new;
end;
$$;

create trigger receiving_documents_auto_number
  before insert on public.receiving_documents
  for each row
  execute function public.receiving_documents_assign_number();

-- ------------------------------------------------------------
-- 5. RLS (mirror the existing role model via current_role())
-- ------------------------------------------------------------
alter table public.receiving_documents enable row level security;
alter table public.receiving_document_items enable row level security;

-- select: any authenticated user
drop policy if exists receiving_documents_select on public.receiving_documents;
create policy receiving_documents_select on public.receiving_documents
  for select to authenticated using (true);

drop policy if exists receiving_document_items_select on public.receiving_document_items;
create policy receiving_document_items_select on public.receiving_document_items
  for select to authenticated using (true);

-- insert: admin or operator (writes a document + all its items)
drop policy if exists receiving_documents_insert on public.receiving_documents;
create policy receiving_documents_insert on public.receiving_documents
  for insert to authenticated
  with check (public.current_role() in ('admin', 'operator'));

drop policy if exists receiving_document_items_insert on public.receiving_document_items;
create policy receiving_document_items_insert on public.receiving_document_items
  for insert to authenticated
  with check (public.current_role() in ('admin', 'operator'));

-- archive / cancel: admin only (soft-delete via deleted_at / status)
drop policy if exists receiving_documents_delete on public.receiving_documents;
create policy receiving_documents_delete on public.receiving_documents
  for delete to authenticated using (public.current_role() = 'admin');

drop policy if exists receiving_document_items_delete on public.receiving_document_items;
create policy receiving_document_items_delete on public.receiving_document_items
  for delete to authenticated using (public.current_role() = 'admin');

-- archive / cancel: soft state change (deleted_at / status), admin only.
-- Items stay immutable -- no update policy is granted on them.
drop policy if exists receiving_documents_update_admin
  on public.receiving_documents;

create policy receiving_documents_update_admin
  on public.receiving_documents
  for update
  to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');