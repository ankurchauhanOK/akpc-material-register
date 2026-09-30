import { useQuery } from "@tanstack/react-query";
import type { Tables } from "@/lib/supabase/database.types";
import {
  fetchEligibleChallans,
  fetchInvoiceByNumber,
  fetchInvoices,
  fetchPartySnapshot,
} from "@/lib/invoices/invoiceApi";
import type {
  EligibleChallan,
  InvoiceDetail,
  InvoiceListItem,
  PartySnapshot,
} from "@/lib/invoices/types";

type Material = Tables<"materials">;

/** All active Component Masters (step 1 of the create flow). */
export function useActiveMaterials(): {
  items: Material[];
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ["materials", "active-invoicable"],
    queryFn: async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Material[];
    },
  });
  return { items: query.data ?? [], isLoading: query.isLoading };
}

/** Send challans eligible for a new invoice on this component. */
export function useEligibleChallans(
  componentId: string | null
): {
  items: EligibleChallan[];
  isLoading: boolean;
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: ["invoices", "eligible", componentId ?? "none"],
    queryFn: () => fetchEligibleChallans(componentId ?? ""),
    enabled: Boolean(componentId),
  });
  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

/** Company (AKPC) + party snapshot for the invoice header. */
export function useInvoiceParties(companyId: string | null): {
  data: PartySnapshot | null;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ["invoices", "parties", companyId ?? "none"],
    queryFn: () => fetchPartySnapshot(companyId ?? ""),
    enabled: Boolean(companyId),
  });
  return { data: query.data ?? null, isLoading: query.isLoading };
}

/** Invoice list page. */
export function useInvoices(): {
  items: InvoiceListItem[];
  isLoading: boolean;
  error: Error | null;
} {
  const query = useQuery({
    queryKey: ["invoices", "active"],
    queryFn: fetchInvoices,
  });
  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}

/** Single invoice detail by number. */
export function useInvoice(invoiceNumber: string | null): {
  invoice: InvoiceDetail | null;
  isLoading: boolean;
  error: Error | null;
} {
  const query = useQuery({
    queryKey: ["invoices", "detail", invoiceNumber ?? "none"],
    queryFn: () =>
      invoiceNumber ? fetchInvoiceByNumber(invoiceNumber) : Promise.resolve(null),
    enabled: Boolean(invoiceNumber),
  });
  return {
    invoice: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}

/** Resolves a Delivery Challan to one of its component masters.
 *
 * Used to bootstrap the create flow from /invoices/new?challan=<id>: the flow
 * is component-first, so the preselected challan has to supply its own
 * component before the eligible-challans query can run. */
export function useChallanComponent(challanId: string | null): {
  componentId: string | null;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ["invoices", "challan-component", challanId ?? "none"],
    queryFn: async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("receiving_documents")
        .select("receiving_document_items(component_id)")
        .eq("id", challanId ?? "")
        .eq("type", "given")
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      const items = (
        data as unknown as {
          receiving_document_items: { component_id: string | null }[] | null;
        } | null
      )?.receiving_document_items;
      // First line that maps to a component master; a challan is only eligible
      // if it has at least one.
      return (
        items?.find((i) => i.component_id != null)?.component_id ?? null
      );
    },
    enabled: Boolean(challanId),
  });
  return {
    componentId: query.data ?? null,
    isLoading: query.isLoading,
  };
}

/** Batch lookup: challan id -> invoice number, for every given challan id.
 *
 * Records renders one row per challan, so calling useInvoiceForChallan per row
 * would fire N queries. This resolves the whole page in one and returns a Map.
 * Challan ids with no invoice are simply absent from the Map. */
export function useInvoiceLinksForChallans(challanIds: string[]): {
  links: Map<string, string>;
  isLoading: boolean;
} {
  // Stable key: the caller passes a fresh array each render, so join/sort it
  // into a primitive to avoid re-running the query on every render.
  const key = [...challanIds].sort().join(",");

  const query = useQuery({
    queryKey: ["invoices", "by-challans", key],
    queryFn: async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("invoice_challans")
        .select("challan_id, invoices(invoice_number)")
        .in("challan_id", challanIds);
      if (error) throw error;
      const rows =
        (data as unknown as Array<{
          challan_id: string;
          invoices: { invoice_number: string } | null;
        }> | null) ?? [];
      return new Map(
        rows
          .filter((r) => r.invoices?.invoice_number)
          .map((r) => [r.challan_id, r.invoices!.invoice_number])
      );
    },
    enabled: challanIds.length > 0,
  });
  return { links: query.data ?? new Map(), isLoading: query.isLoading };
}

/** The invoice that bills a given Delivery Challan, if any.
 *
 * One challan belongs to at most one invoice (UNIQUE(challan_id)), so this is
 * a single row and the challan screens can render a direct "View Invoice" link
 * instead of making the user hunt for it in the invoice list. */
export function useInvoiceForChallan(challanId: string | null): {
  invoiceNumber: string | null;
  invoiceId: string | null;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ["invoices", "by-challan", challanId ?? "none"],
    queryFn: async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("invoice_challans")
        .select("invoice_id, invoices(invoice_number)")
        .eq("challan_id", challanId ?? "")
        .maybeSingle();
      if (error) throw error;
      const link = data as unknown as {
        invoice_id: string;
        invoices: { invoice_number: string } | null;
      } | null;
      return {
        invoiceId: link?.invoice_id ?? null,
        invoiceNumber: link?.invoices?.invoice_number ?? null,
      };
    },
    enabled: Boolean(challanId),
  });
  return {
    invoiceNumber: query.data?.invoiceNumber ?? null,
    invoiceId: query.data?.invoiceId ?? null,
    isLoading: query.isLoading,
  };
}