import { createClient } from "@/lib/supabase/server";
import { ServerRoleBadge } from "@/components/dashboard/server-role-badge";

export const metadata = { title: "Dashboard — AKPC Material Register" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Welcome back, {profile?.full_name ?? user?.email}.
          </p>
        </div>
        <ServerRoleBadge role={profile?.role ?? "viewer"} />
      </div>

      {/* Placeholder — the full dashboard (metrics, quick actions,
          recent transactions) is built in the main UI phase. */}
      <div className="grid gap-6">
        {/* TODO(ui): Today/Month metrics, quick actions, recent records */}
      </div>
    </div>
  );
}
