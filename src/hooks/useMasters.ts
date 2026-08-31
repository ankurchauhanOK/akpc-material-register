import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import type { Component, Party } from "@/lib/supabase/types";

type ComponentParty = Tables<"component_parties">;

/** Active components (materials evolved into Component Master semantics). */
export function useActiveComponents(): {
  items: Component[];
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: ["materials", "active"],
    queryFn: async (): Promise<Component[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Component[];
    },
  });
  return { items: query.data ?? [], refetch: query.refetch };
}

/** All components (including inactive) — for Settings management. */
export function useComponents(): {
  items: Component[];
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ["materials"],
    queryFn: async (): Promise<Component[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Component[];
    },
  });
  return { items: query.data ?? [], isLoading: query.isPending };
}

/** Active parties (companies evolved into Party Master semantics). */
export function useActiveParties(): {
  items: Party[];
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: ["companies", "active"],
    queryFn: async (): Promise<Party[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Party[];
    },
  });
  return { items: query.data ?? [], refetch: query.refetch };
}

/** All parties (including inactive) — for Settings management. */
export function useParties(): {
  items: Party[];
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ["companies"],
    queryFn: async (): Promise<Party[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Party[];
    },
  });
  return { items: query.data ?? [], isLoading: query.isPending };
}

/**
 * Parties explicitly linked to a component via component_parties.
 * Linked party details come from the companies relation embedded by
 * PostgREST when querying the join table with the relation.
 */
export function useComponentParties(
  componentId: string | undefined
): {
  items: (ComponentParty & { party: Party | null })[];
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ["component_parties", componentId],
    queryFn: async (): Promise<(ComponentParty & { party: Party | null })[]> => {
      if (!componentId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("component_parties")
        .select("*, companies(*)")
        .eq("component_id", componentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as ComponentParty & { companies: Party | null };
        return { ...r, party: r.companies ?? null };
      });
    },
    enabled: Boolean(componentId),
  });
  return { items: query.data ?? [], isLoading: query.isPending };
}
