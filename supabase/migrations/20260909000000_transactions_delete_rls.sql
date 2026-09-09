-- Trial version: allow admins to permanently DELETE transactions.
-- This policy will be removed when switching to production (soft-delete/archive).
alter table public.transactions enable row level security;

drop policy if exists transactions_delete_admin on public.transactions;
create policy transactions_delete_admin on public.transactions
  for delete to authenticated
  using (public.current_role() = 'admin');
