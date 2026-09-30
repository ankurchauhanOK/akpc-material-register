-- Fix NULL-unsafe role guards in the invoice RPCs.
--
-- BUG: the guards used `current_role() <> 'admin'` and
-- `current_role() not in ('admin','operator')`. When current_role() is NULL
-- (no session, a JWT whose user has no profile row, or a DEACTIVATED user
-- with is_active = false) those expressions evaluate to NULL rather than
-- TRUE. In PL/pgSQL `IF NULL THEN` is false, so the guard was SKIPPED and
-- the function proceeded -- letting an unauthenticated or deactivated
-- caller create, update, or delete invoices.
--
-- RLS policies are unaffected: `using (current_role() = 'admin')` fails
-- CLOSED, because a NULL predicate filters the row out. Only these explicit
-- PL/pgSQL guards failed open. No other function in the schema has this
-- pattern.
--
-- FIX: use NULL-safe predicates -- `is distinct from 'admin'` (NULL is
-- distinct, so it correctly raises) and an explicit `is null or` prefix for
-- the admin/operator case.
--
-- Verified against the live database by diffing pg_get_functiondef() and
-- patching only the guard lines; every other statement is byte-identical.

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
begin
  if public.current_role() is null or public.current_role() not in ('admin', 'operator') then
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
$function$;


CREATE OR REPLACE FUNCTION public.delete_invoice(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.current_role() is distinct from 'admin' then
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
$function$;


CREATE OR REPLACE FUNCTION public.update_invoice(p_invoice_id uuid, p_remove_challans uuid[] DEFAULT NULL::uuid[], p_add_challans uuid[] DEFAULT NULL::uuid[], p_add_lines jsonb DEFAULT NULL::jsonb, p_kept_lines jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line jsonb;
  v_calc jsonb;
  v_company uuid;
  v_max_line_no integer;
begin
  if public.current_role() is null or public.current_role() not in ('admin', 'operator') then
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
$function$;
