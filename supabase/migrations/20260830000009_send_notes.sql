-- ============================================================
-- AKPC Material Register
-- Migration 0009: receiving_documents.notes
--
-- Persists the optional "Notes" field on the new Send (and any v2
-- document) workflow. The field is UI-backed and genuinely stored — it
-- is NOT a display-only value. Nullable, additive, non-destructive.
-- ============================================================
alter table public.receiving_documents
  add column if not exists notes text;