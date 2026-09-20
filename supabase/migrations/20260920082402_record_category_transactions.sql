-- ============================================================
-- AKPC Material Register
-- Migration: Add record_category enum and column to transactions
-- ============================================================

-- Create the record_category enum type (idempotent)
DO $$
BEGIN
  CREATE TYPE public.record_category AS ENUM ('manufacturing', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

-- Add record_category column to transactions table (nullable for existing records)
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS record_category public.record_category;