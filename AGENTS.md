# AKPC Material Register — Development Notes

A lightweight digital material register for AK Precision Components (AKPC),
replacing the paper receiving/giving register. **This is NOT an ERP.**

## Stack
- Next.js (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui
- Supabase: Postgres, Auth, Storage (private `challans` bucket)
- @tanstack/react-query for data fetching
- Supabase CLI for migrations

## Key conventions
- Single transaction ledger: `transactions` table with `type = received | given`.
  Never store a mutable "current stock" number — derive summaries from transactions.
- Transaction numbers (`REC-000001` / `GIV-000001`) are generated **in the DB**
  (see `supabase/migrations/20260829000003_transactions.sql`), never client-side.
- RLS enabled on all tables; role-based policies (`admin` / `operator` / `viewer`).
  Never expose the service-role key in frontend code.
- Challans go to the private `challans` storage bucket; served via signed URLs.
- **Trial mode:** Admins can permanently DELETE transactions and masters via
  `deleteTransactionPermanently()`, `deleteCompanyPermanently()`, and
  `deleteComponentPermanently()` (all admin-only via RLS; masters already
  had DELETE policies in `0004_rls.sql`, transactions got one in
  `20260909000000_transactions_delete_rls.sql`). `archiveTransaction()`
  (soft-delete via `deleted_at`) is preserved in the codebase for the
  production switch later. To revert: swap the `delete*Permanently` →
  `archive*` functions in `records-page.tsx` / `settings-page.tsx` and
  restore the archive RLS policy.
- Masters linked to live records (transactions/documents) are **blocked**
  from permanent deletion — `getComponentUsageCount()` /
  `getCompanyUsageCount()` pre-check references and FK RESTRICT is the
  backstop. No cascade deletion of business records.
- Transaction `type` cannot be changed once created (DB trigger).
- Indian formatting in the UI (₹, 29 Aug 2026), canonical numeric values in DB.

## Auth (implemented, Phase 2)
- Login-only (email + password). NO public sign-up — users are created manually in
  Supabase Auth by an admin, then promoted via SQL if needed. New profiles default
  to `operator` (see `0001_profiles.sql`).
- Session via `@supabase/ssr`: browser client (`src/lib/supabase/client.ts`),
  server client (`src/lib/supabase/server.ts`), and session refresh/redirect in
  `src/proxy.ts` (Next.js 16 renamed middleware -> proxy).
- Route groups: `(auth)/login` is public; `(app)/*` is protected by a server-side
  check in `src/app/(app)/layout.tsx` (the authoritative gate). The proxy redirect
  is only a routing convenience — RLS is the real security boundary.
- Role helpers in `src/lib/supabase/types.ts`; frontend `RoleGate` is UX-only.
- Database TS types auto-generated into `src/lib/supabase/database.types.ts`
  via `supabase gen types --linked --lang=typescript -s public`. Re-run after
  any schema change.

## First admin bootstrap (manual, once)
After creating the admin's user in Supabase Auth, promote them via SQL Editor:
```sql
update public.profiles set role='admin'
where id = (select id from auth.users where email = '<admin-email>');
```
No self-service role promotion exists.

## Commands
- `npm run dev` — local dev server
- `npm run build` / `npm run lint` — verify build & lint
- `supabase link --project-ref <ref>` — link to the AKPC ERP project
- `supabase db push` — apply `supabase/migrations` to remote
- `npx shadcn@latest add <component>` — add a shadcn/ui component

## Env
`.env.example` is committed; copy to `.env.local` with real values.
Never commit `.env.local`.
