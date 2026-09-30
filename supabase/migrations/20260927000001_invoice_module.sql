-- ============================================================
-- AKPC Material Register
-- Migration: Invoice module
--
-- A Delivery Challan records material movement; an Invoice records
-- billing for that material. An Invoice REFERENCES one or more
-- existing Send (type='given') Delivery Challans — it never
-- modifies, duplicates, or replaces them.
--
-- New:
--   1. materials.default_price       — Component Master base selling price
--   2. company_settings              — + e-mail, bank details, Terms &
--                                      Conditions, Declaration (all
--                                      snapshotted onto every invoice)
--   3. companies                     — + email (customer, shown in the
--                                      BILLED TO / DELIVERY ADDRESS blocks)
--   4. invoices                      — invoice header (snapshots + totals,
--                                      incl. cgst_total / sgst_total)
--   5. invoice_items                 — billing lines (source traceable)
--   6. invoice_challans              — invoice <-> challan links with a
--                                      UNIQUE(challan_id) constraint that
--                                      enforces "one active invoice per
--                                      challan" at the database level
--   7. INV/YYYY-YY/NNN numbering    — server-generated, like DC numbers
--   8. RLS (mirrors 0007)
--   9. Security-definer RPCs        — atomic create / update / delete so a
--                                      challan can never be double-invoiced
--                                      even under concurrent writes
--
-- The AKPC tax invoice is reproduced by the app's own view model
-- (src/lib/invoices/invoice-view.ts) + PDF renderer; this schema only
-- supplies the stored facts. BILLED TO and DELIVERY ADDRESS are two
-- visual blocks fed by the SAME party_* snapshot (AKPC never ships to
-- a different address), so there is no second address column.
--
-- GST is intra-state only, so gst_total is split evenly into
-- cgst_total / sgst_total. Amounts keep paise — there is no rounding
-- step anywhere.
--
-- Numbering is generated inside the database (anti-forgery, same rule as
-- REC/GIV/DC). Audit/trial deletions of invoices are NOT supported: an
-- invoice is permanent and only removable via the authoritative delete
-- flow (admin role) described in the app's business rules.
--
-- Additive / non-destructive.
-- ============================================================

-- ------------------------------------------------------------
-- 1. materials.default_price — Component Master base selling price
-- ------------------------------------------------------------
do $$ begin
  alter table public.materials add column default_price numeric(14,2) check (default_price >= 0);
exception when duplicate_column then null; end $$;

-- ------------------------------------------------------------
-- 1b. Invoice header data that lives on the Company Profile
--
-- The AKPC tax invoice prints an E-mail in the top-right, a bank
-- details block, and the standard Terms & Conditions + Declaration.
-- All four are Company Profile data, edited once in Settings and
-- SNAPSHOTTED onto every invoice at creation (same rule as the
-- our_* identity columns) so historical invoices never change when
-- the profile is later edited.
--
-- Bank details are intentionally left NULL — AKPC fills them in via
-- Settings. The Terms/Declaration text below is the confirmed AKPC
-- wording, seeded verbatim; do not rewrite it.
-- ------------------------------------------------------------
do $$ begin
  alter table public.company_settings add column email text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.company_settings add column bank_account_name text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.company_settings add column bank_account_number text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.company_settings add column bank_ifsc text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.company_settings add column bank_branch text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.company_settings add column terms_and_conditions text;
exception when duplicate_column then null; end $$;

do $$ begin
  alter table public.company_settings add column declaration text;
exception when duplicate_column then null; end $$;

-- Party master: the customer e-mail printed in the BILLED TO /
-- DELIVERY ADDRESS blocks.
do $$ begin
  alter table public.companies add column email text;
exception when duplicate_column then null; end $$;

-- Seed the confirmed AKPC defaults into the single-row profile. Only
-- fills values that are still NULL, so an admin's later edits are
-- never clobbered by a migration re-run.
update public.company_settings
set email = 'akpcpnr@gmail.com',
    terms_and_conditions =
      'Term & condition' || chr(10)
      || '1. Payment terms 45 days' || chr(10)
      || '2. Interest @ 18% p.a will be charged if the payment is not made within stipulated time.' || chr(10)
      || '3. Subject to ''U.S. Nagar'' Jurisdiction only.',
    declaration =
      'We declare that this invoice showing the actual price of the goods described and that all particulars are true and correct.'
where id = '00000000-0000-0000-0000-000000000001'::uuid
  and (email is null or terms_and_conditions is null or declaration is null);

-- ------------------------------------------------------------
-- 2. invoices — the invoice header
-- ------------------------------------------------------------
create table public.invoices (
  id                    uuid primary key default gen_random_uuid(),
  invoice_number        text not null,
  invoice_date          date not null default current_date,
  company_id            uuid not null references public.companies (id),
  -- AKPC identity snapshot (frozen at invoice creation, like challans)
  our_company_name      text,
  our_address           text,
  our_city              text,
  our_state             text,
  our_pincode           text,
  our_gstin             text,
  our_pan               text,
  our_email             text,
  -- bank block (bottom-right of the AKPC invoice)
  bank_account_name     text,
  bank_account_number   text,
  bank_ifsc             text,
  bank_branch           text,
  -- Terms & Conditions + Declaration (verbatim, snapshotted)
  terms_and_conditions  text,
  declaration           text,
  -- party snapshot (frozen at invoice creation)
  party_name            text,
  party_company         text,
  party_location        text,
  party_post            text,
  party_contact         text,
  party_pincode         text,
  party_gstin           text,
  party_state           text,
  party_email           text,
  customer_ref_no       text,
  customer_ref_date     date,
  notes                 text,
  -- financial totals (server-computed, see RPCs below)
  subtotal              numeric(14,2) not null default 0 check (subtotal >= 0),
  gst_total             numeric(14,2) not null default 0 check (gst_total >= 0),
  -- GST is charged intra-state only, so every tax rupee is split evenly
  -- between Central and State tax. sgst_total is computed as the
  -- RESIDUAL (gst_total - cgst_total) rather than an independent 50/50
  -- round, so the pair always sums back to gst_total exactly even when the
  -- tax total carries an odd paise.
  cgst_total            numeric(14,2) not null default 0 check (cgst_total >= 0),
  sgst_total            numeric(14,2) not null default 0 check (sgst_total >= 0),
  total_amount          numeric(14,2) not null default 0 check (total_amount >= 0),
  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists invoices_number_uidx
  on public.invoices (invoice_number);

create index if not exists invoices_date_idx
  on public.invoices (invoice_date);
create index if not exists invoices_company_idx
  on public.invoices (company_id);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row
  execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. invoice_items — billing lines with source traceability
-- ------------------------------------------------------------
create table public.invoice_items (
  id                  uuid primary key default gen_random_uuid(),
  invoice_id          uuid not null references public.invoices (id) on delete cascade,
  line_no             integer not null check (line_no >= 1),
  -- source traceability: which challan + challan line this came from.
  -- ON DELETE CASCADE: the trial-mode permanent delete of a challan (or of
  -- the company / component that owns it) sweeps its dependent invoice rows
  -- with it instead of hard-failing on the FK. The app discloses the invoice
  -- count before the destructive action runs (getCompanyUsageBreakdown /
  -- getComponentUsageBreakdown).
  source_document_id  uuid not null references public.receiving_documents (id) on delete cascade,
  source_item_id      uuid references public.receiving_document_items (id) on delete cascade,
  line_type           public.document_line_type not null,
  component_id        uuid references public.materials (id) on delete cascade,
  item_name           text not null,
  quantity            numeric(14,4) not null check (quantity > 0),
  unit                public.unit_type not null,
  hsn_code            text,
  item_remarks        text,
  -- billing snapshot: the rate actually billed (never rewritten by later
  -- Component Master price changes)
  unit_price          numeric(14,2) not null check (unit_price >= 0),
  gst_percent         numeric(5,2) not null default 0 check (gst_percent >= 0),
  subtotal            numeric(14,2) not null default 0 check (subtotal >= 0),
  gst_amount          numeric(14,2) not null default 0 check (gst_amount >= 0),
  line_total          numeric(14,2) not null default 0 check (line_total >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists invoice_items_invoice_line_uidx
  on public.invoice_items (invoice_id, line_no);
create index if not exists invoice_items_source_document_idx
  on public.invoice_items (source_document_id);

create trigger invoice_items_set_updated_at
  before update on public.invoice_items
  for each row
  execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 4. invoice_challans — invoice <-> challan links (billing consumption)
--
-- UNIQUE (challan_id) is the database-level guarantee behind
-- "a Delivery Challan belongs to only ONE active invoice at a time".
-- Concurrent create attempts hit this index and roll back cleanly.
-- ------------------------------------------------------------
create table public.invoice_challans (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  challan_id  uuid not null references public.receiving_documents (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create unique index if not exists invoice_challans_challan_uidx
  on public.invoice_challans (challan_id);
create unique index if not exists invoice_challans_invoice_challan_uidx
  on public.invoice_challans (invoice_id, challan_id);
create index if not exists invoice_challans_invoice_idx
  on public.invoice_challans (invoice_id);

-- ------------------------------------------------------------
-- 5. Invoice numbering: INV/YYYY-YY/NNN (financial year, like DC)
--    Server-generated only. Numbers are never reused after delete.
-- ------------------------------------------------------------
create sequence if not exists public.inv_seq_AK_2026 start 1;
create sequence if not exists public.inv_seq_AK_2027 start 1;
create sequence if not exists public.inv_seq_AK_2028 start 1;
create sequence if not exists public.inv_seq_AK_2029 start 1;
create sequence if not exists public.inv_seq_AK_2030 start 1;
create sequence if not exists public.inv_seq_AK_2031 start 1;
create sequence if not exists public.inv_seq_AK_2032 start 1;
create sequence if not exists public.inv_seq_AK_2033 start 1;
create sequence if not exists public.inv_seq_AK_2034 start 1;
create sequence if not exists public.inv_seq_AK_2035 start 1;

create or replace function public.generate_invoice_number(p_date date)
returns text
language plpgsql
as $$
declare
  fy_start integer;
  fy_label text;
  seq_name text;
  seq_val bigint;
  result text;
begin
  if extract(month from p_date) >= 4 then
    fy_start := extract(year from p_date)::int;
  else
    fy_start := extract(year from p_date)::int - 1;
  end if;

  -- label = start-year / end-year suffix, e.g. 2026-27
  fy_label := fy_start || '-' || right((fy_start + 1)::text, 2);
  seq_name := 'public.inv_seq_AK_' || fy_start;

  -- auto-create sequence for unknown future years. to_regclass() resolves
  -- identifiers with normal folding rules, unlike a case-sensitive string
  -- compare against pg_sequences.sequencename (which is lowercase).
  if to_regclass(seq_name) is null then
    execute format('create sequence %s start 1', seq_name);
  end if;

  execute format('select nextval(%L)', seq_name) into seq_val;

  result := 'INV/' || fy_label || '/' || lpad(seq_val::text, 3, '0');
  return result;
end;
$$;

create or replace function public.invoices_assign_number()
returns trigger
language plpgsql
as $$
begin
  new.invoice_number := public.generate_invoice_number(new.invoice_date);
  return new;
end;
$$;

create trigger invoices_auto_number
  before insert on public.invoices
  for each row
  execute function public.invoices_assign_number();

-- ------------------------------------------------------------
-- 6. RLS (mirror the existing role model via current_role())
-- ------------------------------------------------------------
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_challans enable row level security;

-- select: any authenticated user
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated using (true);

drop policy if exists invoice_items_select on public.invoice_items;
create policy invoice_items_select on public.invoice_items
  for select to authenticated using (true);

drop policy if exists invoice_challans_select on public.invoice_challans;
create policy invoice_challans_select on public.invoice_challans
  for select to authenticated using (true);

-- All writes are performed through the RPCs below (which validate roles +
-- business rules atomically). Direct client-side writes are denied so the
-- UNIQUE(challan_id) / same-customer / component rules cannot be bypassed.
drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices
  for insert to authenticated with check (false);

drop policy if exists invoice_items_insert on public.invoice_items;
create policy invoice_items_insert on public.invoice_items
  for insert to authenticated with check (false);

drop policy if exists invoice_challans_insert on public.invoice_challans;
create policy invoice_challans_insert on public.invoice_challans
  for insert to authenticated with check (false);

drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices
  for update to authenticated using (false) with check (false);

drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices
  for delete to authenticated using (false);

drop policy if exists invoice_challans_delete on public.invoice_challans;
create policy invoice_challans_delete on public.invoice_challans
  for delete to authenticated using (false);

-- ------------------------------------------------------------
-- 7. Security-definer RPCs — the authoritative write path
-- ------------------------------------------------------------

-- Higher-order line math helper (used by every RPC so the stored money
-- numbers are always server-computed from quantity * unit_price).
create or replace function public.invoice_line_calc(
  p_quantity numeric,
  p_unit_price numeric,
  p_gst_percent numeric
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'subtotal', round(p_quantity * p_unit_price, 2),
    'gst_amount', round(p_quantity * p_unit_price * coalesce(p_gst_percent, 0) / 100, 2),
    'line_total', round(p_quantity * p_unit_price * (1 + coalesce(p_gst_percent, 0) / 100), 2)
  );
$$;

-- Recompute an invoice's header money columns from its stored line items.
--
-- Single source of truth for the totals so create_invoice and update_invoice
-- can never drift. CGST is half the tax, rounded; SGST is the RESIDUAL
-- (gst_total - cgst_total) so the pair always sums back to gst_total exactly
-- — an independent 50/50 round of an odd-paise tax would drift by 0.01.
create or replace function public.invoice_recalc_totals(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_subtotal numeric;
  v_gst numeric;
  v_total numeric;
  v_cgst numeric;
begin
  select coalesce(sum(subtotal), 0),
         coalesce(sum(gst_amount), 0),
         coalesce(sum(line_total), 0)
  into v_subtotal, v_gst, v_total
  from public.invoice_items where invoice_id = p_invoice_id;

  v_cgst := round(v_gst / 2, 2);

  update public.invoices
  set subtotal   = v_subtotal,
      gst_total  = v_gst,
      cgst_total = v_cgst,
      sgst_total = v_gst - v_cgst,
      total_amount = v_total
  where id = p_invoice_id;
end;
$$;

-- Validate that challan ids exist and are legally invoiceable
-- (given / completed / not deleted).
create or replace function public.invoice_validate_challans(p_challans uuid[])
returns void
language plpgsql
as $$
begin
  if exists (
    select 1 from public.receiving_documents d
    where d.id = any (p_challans)
    and (d.type <> 'given' or d.status <> 'completed' or d.deleted_at is not null)
  ) then
    raise exception 'Only saved Send (given) challans can be invoiced.';
  end if;
end;
$$;

create or replace function public.create_invoice(
  p_company_id uuid,
  p_invoice_date date,
  p_notes text,
  p_customer_ref_no text,
  p_customer_ref_date date,
  p_our jsonb,
  p_party jsonb,
  p_lines jsonb,
  p_challans uuid[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invoice_id uuid;
  v_invoice_number text;
  v_line jsonb;
  v_calc jsonb;
  v_docs bigint;
  v_companies bigint;
begin
  if public.current_role() not in ('admin', 'operator') then
    raise exception 'Only admin or operator can create an invoice.';
  end if;

  if p_company_id is null or p_invoice_date is null then
    raise exception 'Missing company or invoice date.';
  end if;
  if p_challans is null or array_length(p_challans, 1) = 0 then
    raise exception 'Select at least one Delivery Challan.';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Invoice has no line items.';
  end if;

  perform public.invoice_validate_challans(p_challans);

  -- customer consistency: all selected challans must share ONE company
  select count(distinct d.company_id) into v_companies
  from public.receiving_documents d where d.id = any (p_challans);
  if v_companies is distinct from 1 then
    raise exception 'All selected challans must belong to the same customer.';
  end if;

  -- the selected company must actually be the challans' company
  select count(*) into v_docs
  from public.receiving_documents d
  where d.id = any (p_challans) and d.company_id <> p_company_id;
  if v_docs > 0 then
    raise exception 'Customer mismatch.';
  end if;

  -- one-active-invoice-per-challan backstop (unique index is the final guard)
  if exists (select 1 from public.invoice_challans where challan_id = any (p_challans)) then
    raise exception 'One or more selected challans are already invoiced.';
  end if;

  insert into public.invoices (
    invoice_number, invoice_date, company_id,
    our_company_name, our_address, our_city, our_state, our_pincode, our_gstin, our_pan,
    our_email, bank_account_name, bank_account_number, bank_ifsc, bank_branch,
    terms_and_conditions, declaration,
    party_name, party_company, party_location, party_post, party_contact, party_pincode,
    party_gstin, party_state, party_email,
    customer_ref_no, customer_ref_date, notes,
    created_by, subtotal, gst_total, cgst_total, sgst_total, total_amount
  ) values (
    '', p_invoice_date, p_company_id,
    p_our ->> 'company_name', p_our ->> 'address', p_our ->> 'city', p_our ->> 'state',
    p_our ->> 'pincode', p_our ->> 'gstin', p_our ->> 'pan',
    p_our ->> 'email', p_our ->> 'bank_account_name', p_our ->> 'bank_account_number',
    p_our ->> 'bank_ifsc', p_our ->> 'bank_branch',
    p_our ->> 'terms_and_conditions', p_our ->> 'declaration',
    p_party ->> 'name', p_party ->> 'company', p_party ->> 'location', p_party ->> 'post',
    p_party ->> 'contact', p_party ->> 'pincode', p_party ->> 'gstin', p_party ->> 'state',
    p_party ->> 'email',
    p_customer_ref_no, p_customer_ref_date, p_notes,
    v_uid, 0, 0, 0, 0, 0
  )
  returning id into v_invoice_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if (v_line ->> 'source_document_id')::uuid is null then
      raise exception 'Every invoice line must trace back to its source challan.';
    end if;
    if (v_line ->> 'source_document_id')::uuid <> all (p_challans) then
      raise exception 'Invoice line belongs to an unchosen challan.';
    end if;

    v_calc := public.invoice_line_calc(
      (v_line ->> 'quantity')::numeric,
      (v_line ->> 'unit_price')::numeric,
      (v_line ->> 'gst_percent')::numeric
    );

    insert into public.invoice_items (
      invoice_id, line_no, source_document_id, source_item_id,
      line_type, component_id, item_name, quantity, unit, hsn_code, item_remarks,
      unit_price, gst_percent, subtotal, gst_amount, line_total
    ) values (
      v_invoice_id,
      (v_line ->> 'line_no')::int,
      (v_line ->> 'source_document_id')::uuid,
      (v_line ->> 'source_item_id')::uuid,
      (v_line ->> 'line_type')::public.document_line_type,
      (v_line ->> 'component_id')::uuid,
      v_line ->> 'item_name',
      (v_line ->> 'quantity')::numeric,
      (v_line ->> 'unit')::public.unit_type,
      v_line ->> 'hsn_code',
      v_line ->> 'item_remarks',
      (v_line ->> 'unit_price')::numeric,
      coalesce((v_line ->> 'gst_percent')::numeric, 0),
      (v_calc ->> 'subtotal')::numeric,
      (v_calc ->> 'gst_amount')::numeric,
      (v_calc ->> 'line_total')::numeric
    );
  end loop;

  insert into public.invoice_challans (invoice_id, challan_id)
  select v_invoice_id, unnest(p_challans);

  perform public.invoice_recalc_totals(v_invoice_id);

  select invoice_number into v_invoice_number
  from public.invoices where id = v_invoice_id;

  return v_invoice_number;
end;
$$;

create or replace function public.update_invoice(
  p_invoice_id uuid,
  p_remove_challans uuid[],
  p_add_challans uuid[],
  p_add_lines jsonb,
  p_kept_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_calc jsonb;
  v_company uuid;
  v_max_line_no integer;
begin
  if public.current_role() not in ('admin', 'operator') then
    raise exception 'Only admin or operator can edit an invoice.';
  end if;

  select company_id into v_company from public.invoices where id = p_invoice_id;
  if v_company is null then
    raise exception 'Invoice not found.';
  end if;

  -- additions: valid challans, same customer, not already invoiced by ANY
  -- OTHER invoice (self-linked rows are excluded so re-adding is a no-op)
  if p_add_challans is not null and array_length(p_add_challans, 1) > 0 then
    perform public.invoice_validate_challans(p_add_challans);
    if exists (
      select 1 from public.receiving_documents d
      where d.id = any (p_add_challans) and d.company_id <> v_company
    ) then
      raise exception 'All challans in an invoice must belong to the same customer.';
    end if;
    if exists (
      select 1 from public.invoice_challans ic
      where ic.challan_id = any (p_add_challans)
        and ic.invoice_id <> p_invoice_id
    ) then
      raise exception 'One or more challans are already invoiced.';
    end if;
  end if;

  -- removals: drop the challan links + ONLY their invoice lines
  if p_remove_challans is not null and array_length(p_remove_challans, 1) > 0 then
    delete from public.invoice_items
    where invoice_id = p_invoice_id and source_document_id = any (p_remove_challans);
    delete from public.invoice_challans
    where invoice_id = p_invoice_id and challan_id = any (p_remove_challans);
  end if;

  -- rate/GST edits on lines the user touched (kept lines). Only the lines
  -- listed here are rewritten; untouched lines keep their stored snapshot.
  if p_kept_lines is not null and jsonb_array_length(p_kept_lines) > 0 then
    for v_line in select * from jsonb_array_elements(p_kept_lines)
    loop
      v_calc := public.invoice_line_calc(
        (v_line ->> 'quantity')::numeric,
        (v_line ->> 'unit_price')::numeric,
        (v_line ->> 'gst_percent')::numeric
      );
      update public.invoice_items
      set unit_price = (v_line ->> 'unit_price')::numeric,
          gst_percent = coalesce((v_line ->> 'gst_percent')::numeric, 0),
          subtotal = (v_calc ->> 'subtotal')::numeric,
          gst_amount = (v_calc ->> 'gst_amount')::numeric,
          line_total = (v_calc ->> 'line_total')::numeric
      where id = (v_line ->> 'id')::uuid and invoice_id = p_invoice_id
        and (v_line ->> 'source_document_id')::uuid <> all (coalesce(p_remove_challans, array[]::uuid[]));
    end loop;
  end if;

  -- additions: insert the author-supplied new lines (rates prefilled from
  -- the Component Master baseline) + links
  if p_add_lines is not null and jsonb_array_length(p_add_lines) > 0 then
    if p_add_challans is null or array_length(p_add_challans, 1) = 0 then
      raise exception 'New lines require their source challans.';
    end if;
    select coalesce(max(line_no), 0) into v_max_line_no
    from public.invoice_items where invoice_id = p_invoice_id;

    for v_line in select * from jsonb_array_elements(p_add_lines)
    loop
      if (v_line ->> 'source_document_id')::uuid <> all (p_add_challans) then
        raise exception 'Invoice line belongs to an unchosen challan.';
      end if;
      v_max_line_no := v_max_line_no + 1;
      v_calc := public.invoice_line_calc(
        (v_line ->> 'quantity')::numeric,
        (v_line ->> 'unit_price')::numeric,
        (v_line ->> 'gst_percent')::numeric
      );
      insert into public.invoice_items (
        invoice_id, line_no, source_document_id, source_item_id,
        line_type, component_id, item_name, quantity, unit, hsn_code, item_remarks,
        unit_price, gst_percent, subtotal, gst_amount, line_total
      ) values (
        p_invoice_id,
        v_max_line_no,
        (v_line ->> 'source_document_id')::uuid,
        (v_line ->> 'source_item_id')::uuid,
        (v_line ->> 'line_type')::public.document_line_type,
        (v_line ->> 'component_id')::uuid,
        v_line ->> 'item_name',
        (v_line ->> 'quantity')::numeric,
        (v_line ->> 'unit')::public.unit_type,
        v_line ->> 'hsn_code',
        v_line ->> 'item_remarks',
        (v_line ->> 'unit_price')::numeric,
        coalesce((v_line ->> 'gst_percent')::numeric, 0),
        (v_calc ->> 'subtotal')::numeric,
        (v_calc ->> 'gst_amount')::numeric,
        (v_calc ->> 'line_total')::numeric
      );
    end loop;
  end if;

  if p_add_challans is not null and array_length(p_add_challans, 1) > 0 then
    insert into public.invoice_challans (invoice_id, challan_id)
    select p_invoice_id, unnest(p_add_challans)
    on conflict (challan_id) do nothing;
  end if;

  -- An invoice must always bill at least one challan. Enforced HERE (not just
  -- in the UI) so an API caller can't strand a zero-line, zero-value invoice.
  if not exists (
    select 1 from public.invoice_challans where invoice_id = p_invoice_id
  ) then
    raise exception 'An invoice must keep at least one Delivery Challan.';
  end if;

  perform public.invoice_recalc_totals(p_invoice_id);

  return p_invoice_id;
end;
$$;

create or replace function public.delete_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() <> 'admin' then
    raise exception 'Only admin can delete an invoice.';
  end if;

  -- Guard the id: without this a stale/bad id silently "succeeds" and the UI
  -- reports a delete that never happened.
  if not exists (select 1 from public.invoices where id = p_invoice_id) then
    raise exception 'Invoice not found.';
  end if;

  delete from public.invoice_items where invoice_id = p_invoice_id;
  delete from public.invoice_challans where invoice_id = p_invoice_id;
  delete from public.invoices where id = p_invoice_id;
end;
$$;

-- Supabase exposes execute by default; be explicit for the write path.
grant execute on function public.create_invoice, public.update_invoice, public.delete_invoice to authenticated;
grant execute on function public.invoice_line_calc, public.invoice_validate_challans, public.invoice_recalc_totals to authenticated;