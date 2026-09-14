-- ============================================================
-- AKPC Material Register
-- Migration 0012: Fix DC sequence existence check
--
-- generate_dc_number() checked whether a per-financial-year sequence
-- existed by comparing against pg_sequences.sequencename with a
-- case-sensitive string literal ('dc_seq_AK_2026'). Postgres folds
-- unquoted identifiers to lowercase, so the stored name is
-- 'dc_seq_ak_2026' and the compare never matched. The function then
-- tried to re-create the existing sequence, raising 42P07 and aborting
-- every Send (type='given') insert with a generic client error.
--
-- Fix: resolve existence via to_regclass() (identifier-folding aware)
-- and widen the pre-created sequence horizon so the runtime auto-create
-- branch — which the authenticated role usually cannot execute in the
-- public schema on PG15+ — is never reached in practice.
--
-- This migration is additive / non-destructive.
-- ============================================================

-- extend the pre-created horizon (2026-2028 already exist from 0011)
create sequence if not exists public.dc_seq_AK_2029 start 1;
create sequence if not exists public.dc_seq_AK_2030 start 1;
create sequence if not exists public.dc_seq_AK_2031 start 1;
create sequence if not exists public.dc_seq_AK_2032 start 1;
create sequence if not exists public.dc_seq_AK_2033 start 1;
create sequence if not exists public.dc_seq_AK_2034 start 1;
create sequence if not exists public.dc_seq_AK_2035 start 1;

create or replace function public.generate_dc_number(p_date date)
returns text
language plpgsql
as $$
declare
  fy_start integer;       -- financial year start (e.g. 2026)
  fy_label text;          -- e.g. '2026-27'
  seq_name text;          -- e.g. 'public.dc_seq_AK_2026'
  seq_val bigint;
  result text;
begin
  -- financial year: Apr-Mar. If month >= 4, FY starts this year; else last year.
  if extract(month from p_date) >= 4 then
    fy_start := extract(year from p_date)::int;
  else
    fy_start := extract(year from p_date)::int - 1;
  end if;

  fy_label := fy_start || '-' || right(fy_start::text, 2);
  seq_name := 'public.dc_seq_AK_' || fy_start;

  -- auto-create sequence for unknown future years. to_regclass() resolves
  -- identifiers with normal folding rules, unlike a case-sensitive string
  -- compare against pg_sequences.sequencename (which is lowercase).
  if to_regclass(seq_name) is null then
    execute format('create sequence %s start 1', seq_name);
  end if;

  -- get next value (the document_number unique index is the backstop)
  execute format('select nextval(%L)', seq_name) into seq_val;

  result := 'AK/' || fy_label || '/' || lpad(seq_val::text, 3, '0');
  return result;
end;
$$;