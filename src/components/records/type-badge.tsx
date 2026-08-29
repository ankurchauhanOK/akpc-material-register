import { Badge } from "@/components/ui/badge";

export function TypeBadge({ type }: { type: "received" | "given" }) {
  return (
    <Badge
      variant={type === "received" ? "default" : "secondary"}
      className={type === "received" ? "bg-emerald-600" : "bg-amber-100 text-amber-800"}
    >
      {type === "received" ? "Received" : "Given"}
    </Badge>
  );
}
