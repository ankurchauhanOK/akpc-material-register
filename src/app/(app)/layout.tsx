import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthProvider } from "@/hooks/useAuth";
import { AppHeader } from "@/components/layout/app-header";
import { SideRail } from "@/components/layout/side-rail";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import type { Role } from "@/components/layout/nav-config";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session (or expired) -> login. This is the real server-side gate;
  // the proxy handles the same redirect for convenience, but this layout
  // is authoritative and always re-checks.
  if (!user) {
    redirect("/login");
  }

  // Load the operator/admin profile for this user.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // A signed-in user without a profile, or an inactive profile, is blocked
  // from the app until an admin fixes their account.
  if (!profile || !profile.is_active) {
    redirect("/login");
  }

  const role = profile.role as Role;

  return (
    <AuthProvider>
      <div className="flex min-h-screen bg-zinc-50">
        <SideRail role={role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader role={role} userEmail={user.email} />
          <main className="flex-1 px-3 pb-24 pt-4 sm:px-4 lg:pb-4">
            <div className="mx-auto max-w-[1360px]">{children}</div>
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </AuthProvider>
  );
}
