-- ============================================================
-- AKPC Material Register
-- Migration 0003: transactions (the single movement ledger) +
--                 database-safe transaction number generation
-- ============================================================

-- Transaction type enum
do $$
begin
  create type public.transaction_type as enum ('received', 'given');
exception
  when duplicate_object then null;
end $$;

create table public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  transaction_number text not null,
  type               public.transaction_type not null,
  material_id        uuid not null references public.materials (id),
  company_id         uuid not null references public.companies (id),
  pieces             integer not null check (pieces > 0),
  total_amount       numeric(14,2) not null default 0 check (total_amount >= 0),
  transaction_date   date not null default current_date,
  -- challan is REQUIRED for every transaction in v1. A transaction cannot
  -- be created without a challan (design.md §11, §22). The app uploads the
  -- challan first, gets the storage path, then creates the transaction.
  challan_path       text not null,
  created_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

-- unique transaction numbers (applied via insert trigger)
create unique index transactions_number_uidx on public.transactions (transaction_number);

-- indexes for the search / filter / cross-check paths
create index transactions_date_idx   on public.transactions (transaction_date);
create index transactions_type_idx   on public.transactions (type);
create index transactions_material_idx on public.transactions (material_id);
create index transactions_company_idx  on public.transactions (company_id);
create index transactions_created_by_idx on public.transactions (created_by);
create index transactions_active_idx on public.transactions (deleted_at) where deleted_at is null;

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row
  execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Transaction number generation (database-safe)
--
-- Generates REC-000001 / GIV-000001 style numbers on insert.
-- Numbers are generated server-side in the database so two
-- clients can never produce the same number (design.md §17).
-- A dedicated sequence per type gives clean, monotonic numbers.
-- ------------------------------------------------------------
create sequence public.txn_seq_REC start 1;
create sequence public.txn_seq_GIV start 1;

create function public.generate_transaction_number(p_type public.transaction_type)
returns text
language plpgsql
as $$
declare
  prefix text := case p_type when 'received' then 'REC' else 'GIV' end;
  seq_name text := case p_type when 'received' then 'txn_seq_REC' else 'txn_seq_GIV' end;
  new_number text;
begin
  new_number := prefix || '-' || lpad(nextval(seq_name)::text, 6, '0');

  -- collision safety net (e.g. if rows already existed before this migration)
  while exists (select 1 from public.transactions where transaction_number = new_number) loop
    new_number := prefix || '-' || lpad(nextval(seq_name)::text, 6, '0');
  end loop;

  return new_number;
end;
$$;

-- trigger to assign the number on insert.
-- IMPORTANT: the number is ALWAYS server-generated. Whatever the client
-- puts in transaction_number is ignored/overwritten, so transaction
-- numbers can never be forged client-side (design.md §17).
create function public.transactions_assign_number()
returns trigger
language plpgsql
as $$
begin
  new.transaction_number := public.generate_transaction_number(new.type);
  return new;
end;
$$;

create trigger transactions_auto_number
  before insert on public.transactions
  for each row
  execute function public.transactions_assign_number();

-- prevent casually changing a transaction's type (received <-> given).
-- per design.md §21, do not silently turn REC-x into GIV-x.
create function public.transactions_prevent_type_change()
returns trigger
language plpgsql
as $$
begin
  if old.type is distinct from new.type then
    raise exception 'transaction type cannot be changed; create a new transaction instead';
  end if;
  return new;
end;
$$;

create trigger transactions_no_type_change
  before update on public.transactions
  for each row
  execute function public.transactions_prevent_type_change();
