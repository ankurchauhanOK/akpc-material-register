-- Direct Invoice: an invoice with NO Delivery Challan, whose items are typed
-- in by hand.
--
-- WHY THIS NEEDS A MIGRATION
-- --------------------------
-- "Every invoice bills at least one Delivery Challan" was never a single
-- constraint; it was seven separate assumptions spread across the schema and
-- the two write RPCs:
--
--   1. invoice_items.source_document_id uuid NOT NULL REFERENCES
--      receiving_documents(id)                       -- the only declarative one
--   2. create_invoice: "Select at least one Delivery Challan."
--   3. create_invoice: every line must carry a non-null source_document_id
--   4. create_invoice: every line's source must be one of p_challans
--   5. create_invoice: customer-consistency checks keyed on p_challans
--   6. update_invoice: "New lines require their source challans."
--   7. update_invoice: "An invoice must keep at least one Delivery Challan."
--
-- Only #1 blocks a manual line at the storage layer. #2-#7 are business rules
-- in PL/pgSQL, and they are relaxed ONLY on the direct branch below.
--
-- WHAT THIS MIGRATION DOES NOT TOUCH
-- ----------------------------------
--   * No RLS policy is created, dropped or altered. The invoice tables keep
--     their `with check (false)` / `using (false)` client-side policies, so
--     every write still has to go through the SECURITY DEFINER RPCs below.
--   * Every RPC keeps SECURITY DEFINER + SET search_path TO 'public'.
--   * The NULL-safe role guards from 20260928000001 are preserved verbatim --
--     they are the security boundary, not an obstacle to relax.
--   * No index or FK is dropped: source_document_id keeps its FK (a NULL FK
--     reference is simply not checked) and keeps
--     invoice_items_source_document_idx.
--   * delete_invoice, invoice_line_calc, invoice_validate_challans,
--     invoice_recalc_totals, generate_invoice_number and the challan-number
--     logic are not redefined.
--   * The challan-backed branch of create_invoice / update_invoice is
--     byte-identical to 20260928000001 apart from being wrapped in
--     `if not v_is_direct then ... end if;`.
--
-- MODE IS A STORED FACT, NOT AN INFERENCE
-- ---------------------------------------
-- invoice_type is a column rather than "direct iff invoice_challans is empty",
-- because the challan-backed post-condition in #7 must stay enforceable: if
-- the mode were inferred, removing the last challan would silently flip a
-- challan invoice into a direct one instead of raising. The column also gives
-- the list/detail pages a stable badge to render.
--
-- The backfill below is a no-op safety net on a database where create_invoice
-- has always required a challan, but it makes the invariant true from the
-- moment this migration lands rather than assuming it.
--
-- MODES ARE EXCLUSIVE
-- -------------------
-- A direct invoice can never gain a challan and a challan-backed invoice can
-- never gain a manual line. Without that, `invoice_type` would be a lie: the
-- edit page would show a challan section on a "direct" invoice and the #7
-- post-condition would have nothing to say about the other half. Both are
-- rejected in update_invoice below.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

-- A NULL source_document_id now means "manual line, typed by hand". The FK
-- stays: ON DELETE CASCADE is now unreachable for direct rows, which is
-- correct -- nothing to cascade from.
alter table public.invoice_items
  alter column source_document_id drop not null;

comment on column public.invoice_items.source_document_id is
  'Source Delivery Challan for a challan-backed line. NULL = a manual line on a Direct Invoice. Both source columns are NULL together (checked by create_invoice / update_invoice).';

alter table public.invoices
  add column if not exists invoice_type text not null default 'challan';

alter table public.invoices
  add constraint invoices_invoice_type_chk
  check (invoice_type in ('challan', 'direct'));

comment on column public.invoices.invoice_type is
  '''challan'' = billed against linked Delivery Challans. ''direct'' = items typed by hand and no invoice_challans rows. Set by create_invoice from whether p_challans is empty; never edited after creation.';

update public.invoices i
set invoice_type = 'direct'
where not exists (
  select 1 from public.invoice_challans ic where ic.invoice_id = i.id
);

-- ---------------------------------------------------------------------------
-- 2. create_invoice -- direct mode is "no challans supplied"
-- ---------------------------------------------------------------------------
-- Signature and defaults are UNCHANGED, so this is a plain CREATE OR REPLACE:
-- no DROP, no risk of PostgREST seeing an ambiguous overload, and the existing
-- grant on line 734 of 20260927000001 survives a replace (a grant is attached
-- to the function object, and OR REPLACE keeps the same oid).
--
-- Note the empty-array trap this fixes: `array_length('{}'::uuid[], 1)` is
-- NULL, not 0, so the original `array_length(p_challans,1) = 0` test never
-- matched an empty array -- it fell through to the customer-consistency check,
-- which then failed with the misleading 'All selected challans must belong
-- to the same customer.' for what was really an empty selection. coalesce()
-- folds NULL (no array, or an empty one) onto the same branch.
CREATE OR REPLACE FUNCTION public.create_invoice(p_company_id uuid, p_invoice_date date, p_our jsonb, p_party jsonb, p_lines jsonb, p_challans uuid[], p_notes text DEFAULT NULL::text, p_customer_ref_no text DEFAULT NULL::text, p_customer_ref_date date DEFAULT NULL::date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_invoice_id uuid;
  v_invoice_number text;
  v_line jsonb;
  v_calc jsonb;
  v_docs bigint;
  v_companies bigint;
  -- Direct Invoice = no challans supplied. An absent array and an empty array
  -- both mean the same thing (see the coalesce note above).
  v_is_direct boolean := coalesce(array_length(p_challans, 1), 0) = 0;
begin
  if public.current_role() is null or public.current_role() not in ('admin', 'operator') then
    raise exception 'Only admin or operator can create an invoice.';
  end if;

  if p_company_id is null or p_invoice_date is null then
    raise exception 'Missing company or invoice date.';
  end if;
  -- Held for both modes: an invoice with no lines is not an invoice. The
  -- "at least one Delivery Challan" check moves into the challan branch.
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Invoice has no line items.';
  end if;

  if not v_is_direct then
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
  end if;

  insert into public.invoices (
    invoice_number, invoice_date, company_id, invoice_type,
    our_company_name, our_address, our_city, our_state, our_pincode, our_gstin, our_pan,
    our_email, bank_account_name, bank_account_number, bank_ifsc, bank_branch,
    terms_and_conditions, declaration,
    party_name, party_company, party_location, party_post, party_contact, party_pincode,
    party_gstin, party_state, party_email,
    customer_ref_no, customer_ref_date, notes,
    created_by, subtotal, gst_total, cgst_total, sgst_total, total_amount
  ) values (
    '', p_invoice_date, p_company_id,
    case when v_is_direct then 'direct' else 'challan' end,
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
    if v_is_direct then
      -- A manual line must NOT smuggle in a source: the whole point of a
      -- Direct Invoice is that nothing is billed against a challan. Rejected
      -- rather than ignored so a client bug fails loudly instead of silently
      -- producing a link-less line on a "direct" invoice that looks sourced.
      if (v_line ->> 'source_document_id') is not null
        or (v_line ->> 'source_item_id') is not null then
        raise exception 'A Direct Invoice item cannot reference a Delivery Challan.';
      end if;
    else
      if (v_line ->> 'source_document_id')::uuid is null then
        raise exception 'Every invoice line must trace back to its source challan.';
      end if;
      if (v_line ->> 'source_document_id')::uuid <> all (p_challans) then
        raise exception 'Invoice line belongs to an unchosen challan.';
      end if;
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

  if not v_is_direct then
    insert into public.invoice_challans (invoice_id, challan_id)
    select v_invoice_id, unnest(p_challans);
  end if;

  perform public.invoice_recalc_totals(v_invoice_id);

  -- Belt-and-braces post-condition. invoice_type and the link table must agree
  -- or the list/detail badge would misreport the document.
  if v_is_direct and exists (
    select 1 from public.invoice_challans where invoice_id = v_invoice_id
  ) then
    raise exception 'A Direct Invoice cannot be linked to a Delivery Challan.';
  end if;

  select invoice_number into v_invoice_number
  from public.invoices where id = v_invoice_id;

  return v_invoice_number;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. update_invoice -- mode-aware edits
-- ---------------------------------------------------------------------------
-- NEW PARAMETER, SO THIS ONE MUST BE DROPPED FIRST.
--
-- CREATE OR REPLACE FUNCTION matches on the argument list. Adding
-- p_remove_line_ids therefore does NOT replace the 5-argument version, it
-- creates a SECOND overload beside it -- and PostgREST then fails the call
-- with "ambiguous function" (multiple candidates). Dropping the old
-- signature first is mandatory, not stylistic.
--
-- Dropping removes the grant, so it is re-issued immediately after (mirroring
-- 20260927000001 line 734, which grants on the 5-arg signature).
drop function if exists public.update_invoice(uuid, uuid[], uuid[], jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.update_invoice(p_invoice_id uuid, p_remove_challans uuid[] DEFAULT NULL::uuid[], p_add_challans uuid[] DEFAULT NULL::uuid[], p_add_lines jsonb DEFAULT NULL::jsonb, p_kept_lines jsonb DEFAULT NULL::jsonb, p_remove_line_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line jsonb;
  v_calc jsonb;
  v_company uuid;
  v_type text;
  v_max_line_no integer;
  v_qty numeric;
begin
  if public.current_role() is null or public.current_role() not in ('admin', 'operator') then
    raise exception 'Only admin or operator can edit an invoice.';
  end if;

  select company_id, invoice_type into v_company, v_type
  from public.invoices where id = p_invoice_id;
  if v_company is null then
    raise exception 'Invoice not found.';
  end if;

  -- Modes stay exclusive (see the header note). Rejecting a cross-mode edit
  -- here keeps invoice_type truthful and stops the challan section from
  -- appearing on a Direct Invoice in the edit page.
  if v_type = 'direct' and (
    coalesce(array_length(p_add_challans, 1), 0) > 0
    or coalesce(array_length(p_remove_challans, 1), 0) > 0
  ) then
    raise exception 'A Direct Invoice cannot be linked to Delivery Challans.';
  end if;
  if v_type = 'challan' and coalesce(array_length(p_remove_line_ids, 1), 0) > 0 then
    raise exception 'A Delivery Challan invoice cannot remove individual items.';
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

  -- Direct Invoice only: remove manual lines by id. Invoice items cannot be
  -- removed by challan (they have no source), so this is the only way to drop
  -- one. Guarded to direct invoices above, and scoped to this invoice's own
  -- ids, so a stale id from another invoice is a no-op rather than a
  -- cross-invoice delete.
  if p_remove_line_ids is not null and array_length(p_remove_line_ids, 1) > 0 then
    delete from public.invoice_items
    where invoice_id = p_invoice_id
      and id = any (p_remove_line_ids)
      and source_document_id is null;
  end if;

  -- rate/GST edits on lines the user touched (kept lines). Only the lines
  -- listed here are rewritten; untouched lines keep their stored snapshot.
  --
  -- On a Direct Invoice EVERY field is editable, not just the rate: a manual
  -- line has no challan behind it holding the description, HSN or quantity, so
  -- they are the user's own data and must be correctable. The `v_type = 'direct'`
  -- guard keeps the challan-backed behaviour byte-identical -- there, qty /
  -- description / HSN stay the challan's snapshot and only price moves.
  if p_kept_lines is not null and jsonb_array_length(p_kept_lines) > 0 then
    for v_line in select * from jsonb_array_elements(p_kept_lines)
    loop
      -- The EFFECTIVE quantity drives the money, not blindly the supplied one.
      -- A direct line takes the author's number; a challan line keeps its
      -- stored quantity, because the guarded `quantity =` assignment below
      -- ignores whatever arrived on the wire. Reading it back here is what
      -- keeps subtotal/line_total in agreement with the quantity actually
      -- stored -- otherwise a client sending a stale 999 would be billed for
      -- 999 while the printed document still said 2.
      if v_type = 'direct' then
        v_qty := (v_line ->> 'quantity')::numeric;
      else
        select quantity into v_qty
        from public.invoice_items
        where id = (v_line ->> 'id')::uuid and invoice_id = p_invoice_id;
      end if;

      v_calc := public.invoice_line_calc(
        v_qty,
        (v_line ->> 'unit_price')::numeric,
        (v_line ->> 'gst_percent')::numeric
      );
      update public.invoice_items
      set unit_price = (v_line ->> 'unit_price')::numeric,
          gst_percent = coalesce((v_line ->> 'gst_percent')::numeric, 0),
          subtotal = (v_calc ->> 'subtotal')::numeric,
          gst_amount = (v_calc ->> 'gst_amount')::numeric,
          line_total = (v_calc ->> 'line_total')::numeric,
          item_name = case when v_type = 'direct' then v_line ->> 'item_name' else item_name end,
          hsn_code = case when v_type = 'direct' then v_line ->> 'hsn_code' else hsn_code end,
          item_remarks = case when v_type = 'direct' then v_line ->> 'item_remarks' else item_remarks end,
          quantity = case when v_type = 'direct'
            then (v_line ->> 'quantity')::numeric
            else quantity end,
          unit = case when v_type = 'direct'
            then (v_line ->> 'unit')::public.unit_type
            else unit end
      where id = (v_line ->> 'id')::uuid and invoice_id = p_invoice_id
        and (
          -- NULL-safe: a direct line has no source, so it must not be compared
          -- against p_remove_challans at all (NULL <> ANY(...) is NULL, which
          -- would silently drop the row from the update).
          (v_line ->> 'source_document_id') is null
          or (v_line ->> 'source_document_id')::uuid <> all (coalesce(p_remove_challans, array[]::uuid[]))
        );
    end loop;
  end if;

  -- additions: insert the author-supplied new lines (rates prefilled from
  -- the Component Master baseline) + links
  if p_add_lines is not null and jsonb_array_length(p_add_lines) > 0 then
    if v_type = 'direct' then
      -- no challan needed (or allowed) -- the check the challan branch does below
      for v_line in select * from jsonb_array_elements(p_add_lines)
      loop
        if (v_line ->> 'source_document_id') is not null
          or (v_line ->> 'source_item_id') is not null then
          raise exception 'A Direct Invoice item cannot reference a Delivery Challan.';
        end if;
        v_max_line_no := coalesce(
          (select max(line_no) from public.invoice_items where invoice_id = p_invoice_id),
          0
        ) + 1;
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
          null, null,
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
    else
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
  end if;

  if p_add_challans is not null and array_length(p_add_challans, 1) > 0 then
    insert into public.invoice_challans (invoice_id, challan_id)
    select p_invoice_id, unnest(p_add_challans)
    on conflict (challan_id) do nothing;
  end if;

  -- Every invoice must keep its defining content. Enforced HERE (not just in
  -- the UI) so an API caller can't strand a zero-line, zero-value invoice.
  -- The challan case is the pre-existing rule, unchanged; the direct case is
  -- its mirror image.
  if v_type = 'challan' and not exists (
    select 1 from public.invoice_challans where invoice_id = p_invoice_id
  ) then
    raise exception 'An invoice must keep at least one Delivery Challan.';
  end if;
  if v_type = 'direct' and not exists (
    select 1 from public.invoice_items where invoice_id = p_invoice_id
  ) then
    raise exception 'A Direct Invoice must keep at least one item.';
  end if;

  perform public.invoice_recalc_totals(p_invoice_id);

  return p_invoice_id;
end;
$function$;

-- Re-issue the grant dropped along with the 5-argument update_invoice.
grant execute on function public.update_invoice(uuid, uuid[], uuid[], jsonb, jsonb, uuid[]) to authenticated;

-- create_invoice was replaced in place (same signature), so its grant is
-- untouched. delete_invoice and the three helpers are not redefined at all,
-- so their grants and bodies are untouched too.