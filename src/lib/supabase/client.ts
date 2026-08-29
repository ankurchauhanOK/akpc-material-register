"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  );
}

// Browser-side Supabase client (used in client components).
// Uses only the publishable (anon) key. The service-role key must
// never appear in frontend code — RLS is the security boundary.
export function createClient() {
  return createBrowserClient<Database>(
    supabaseUrl!,
    supabaseAnonKey!
  );
}
