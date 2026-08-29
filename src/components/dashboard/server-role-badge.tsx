import type { Enums } from "@/lib/supabase/database.types";
import { Badge } from "@/components/ui/badge";

const ROLE_STYLES: Record<
  Enums<"app_role">,
  { label: string; className: string }
> = {
  admin: { label: "Admin", className: "bg-blue-100 text-blue-700" },
  operator: { label: "Operator", className: "bg-emerald-100 text-emerald-700" },
  viewer: { label: "Viewer", className: "bg-zinc-100 text-zinc-600" },
};

export function ServerRoleBadge({
  role,
}: {
  role: Enums<"app_role">;
}) {
  const styles = ROLE_STYLES[role] ?? ROLE_STYLES.viewer;
  return (
    <Badge variant="secondary" className={styles.className}>
      {styles.label}
    </Badge>
  );
}
