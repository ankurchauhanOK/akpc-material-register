-- ============================================================
-- AKPC Material Register
-- Migration 0008: extend document_source with 'customer'
--
-- The document_source enum was defined as ('supplier','shop') for the
-- RECEIVE flow only — it describes the counterparty AKPC is receiving
-- FROM. A SEND document (type='given') is outgoing: material dispatched
-- from AKPC to a customer/destination. Neither 'supplier' nor 'shop'
-- correctly describes that direction (and leaving the NOT NULL column
-- with a NULL or an inward-looking value would teach the DB to lie).
--
-- Add a forward-only enum value 'customer' so both directions are
-- represented faithfully:
--   Receive: supplier = received from supplier | shop = received from shop
--   Send:    customer = sent to customer
--
-- This mirrors the legacy `transactions` convention (migration 0006),
-- where a `given` transaction's party is the customer.
--
-- Additive / non-destructive. The new value is NOT referenced anywhere
-- in this migration (a PG enum ADD VALUE cannot be used in the same
-- transaction it is added), so this is a safe statement block.
-- ============================================================
do $$ begin
  alter type public.document_source add value 'customer';
exception
  when duplicate_object then null;
end $$;