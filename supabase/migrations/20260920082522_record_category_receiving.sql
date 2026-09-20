-- ============================================================
-- AKPC Material Register
-- Migration: Add record_category enum and column to receiving_documents
-- ============================================================

-- The record_category enum is already created from the transactions migration (idempotent)
DO $$
BEGIN
  CREATE TYPE public.record_category AS ENUM ('manufacturing', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

-- Add record_category column to receiving_documents table (nullable for existing records)
ALTER TABLE public.receiving_documents
ADD COLUMN IF NOT EXISTS record_category public.record_category;