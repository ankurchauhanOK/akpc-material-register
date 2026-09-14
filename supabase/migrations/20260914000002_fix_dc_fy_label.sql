-- ============================================================
-- AKPC Material Register
-- Migration 0013: Fix financial-year label + restart FY2026 sequence
--
-- generate_dc_number() built the FY label with the START-year suffix
-- (e.g. 'AK/2026-26/001'), but the AKPC challan format uses the END-year
-- suffix ('AK/2026-27/001').
--
-- No real documents were persisted with the wrong label — every previous
-- Send insert aborted inside the trigger (42P07 / numbering bug), and the
-- two values consumed by the verification query were never written to
-- receiving_documents. The FY2026 sequence is therefore restarted so the
-- first real challan comes out as AK/2026-27/001.
--
-- This migration is additive / non-destructive.
-- ============================================================

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

  -- label = start-year / end-year suffix, e.g. 2026-27
  fy_label := fy_start || '-' || right((fy_start + 1)::text, 2);
  seq_name := 'public.dc_seq_AK_' || fy_start;

  -- auto-create sequence for unknown future years. to_regclass() resolves
  -- identifiers with normal folding rules (see migration 0012).
  if to_regclass(seq_name) is null then
    execute format('create sequence %s start 1', seq_name);
  end if;

  -- get next value (the document_number unique index is the backstop)
  execute format('select nextval(%L)', seq_name) into seq_val;

  result := 'AK/' || fy_label || '/' || lpad(seq_val::text, 3, '0');
  return result;
end;
$$;

-- no documents carry the wrong label (verified before this migration),
-- so restart the current FY sequence for a clean AK/2026-27/001 start
alter sequence public.dc_seq_AK_2026 restart with 1;