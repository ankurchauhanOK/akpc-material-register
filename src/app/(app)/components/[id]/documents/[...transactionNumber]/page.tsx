import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentDetail } from "@/components/components/document-detail";
import { ChallanPreview } from "@/components/challan/challan-preview";
import type { Tables } from "@/lib/supabase/database.types";

// The document number contains slashes for Send (e.g. AK/2026-27/001) but
// not for legacy (GIV-000001), so the route is a catch-all that reassembles
// the number by joining the slug segments with "/". A trailing "challan"
// segment switches to the A4 challan preview; otherwise the detail view is
// rendered. The catch-all must stay the last segment (Next.js 16 rule).
//
// URLs are encode-agnostic: Next.js does not split/dedupe an encoded slash
// (%2F) in a dynamic segment, so a client that percent-encodes the number
// arrives as ONE slug segment. We decode the joined value so both the raw
// (AK/2026-27/001/challan) and encoded (%2F) forms resolve to the same row
// instead of 404ing.

function normalizeSlug(
  slug: string[]
): { transactionNumber: string; isChallan: boolean } {
  const joined = slug.join("/");
  let decoded = joined;
  try {
    decoded = decodeURIComponent(joined);
  } catch {
    // Malformed percent sequences: keep the raw value rather than crashing.
  }
  const isChallan = decoded.endsWith("/challan");
  const transactionNumber = isChallan
    ? decoded.slice(0, -"/challan".length)
    : decoded;
  return { transactionNumber, isChallan };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; transactionNumber: string[] }>;
}) {
  const { transactionNumber: slug } = await params;
  const { isChallan } = normalizeSlug(slug);
  return {
    title: isChallan
      ? "Challan Preview — AKPC Material Register"
      : "Document — AKPC Material Register",
  };
}

export default async function ComponentDocumentPage({
  params,
}: {
  params: Promise<{ id: string; transactionNumber: string[] }>;
}) {
  const { id, transactionNumber: slug } = await params;
  const { transactionNumber, isChallan } = normalizeSlug(slug);
  const supabase = await createClient();

  const { data: component } = await supabase
    .from("materials")
    .select("*")
    .eq("id", id)
    .single();

  if (!component) notFound();

  // A document number may map to either a legacy single-item transaction
  // (Send / pre-v2 receive) or a v2 receiving_documents header with lines.
  const { data: legacy } = await supabase
    .from("transactions")
    .select("*")
    .eq("transaction_number", transactionNumber)
    .eq("material_id", id)
    .single();

  if (legacy && !isChallan) {
    return (
      <div className="mx-auto max-w-3xl">
        <DocumentDetail
          component={component}
          transaction={{ ...legacy, items: null }}
        />
      </div>
    );
  }

  // v2 document: look up the header plus its line items.
  const { data: doc } = await supabase
    .from("receiving_documents")
    .select("*, receiving_document_items(*)")
    .eq("document_number", transactionNumber)
    .single();

  if (!doc) notFound();

  const docRow = doc as Record<string, unknown>;
  const itemsRaw = docRow.receiving_document_items;

  if (isChallan) {
    const previewDoc = {
      ...(docRow as unknown as Tables<"receiving_documents">),
      items: Array.isArray(itemsRaw)
        ? (itemsRaw as Tables<"receiving_document_items">[])
        : [],
    };
    return (
      <div className="bg-zinc-100 min-h-screen">
        <ChallanPreview
          doc={previewDoc}
          component={component}
          partCode={component.part_code ?? null}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <DocumentDetail
        component={component}
        transaction={
          {
            ...docRow,
            transaction_number: doc.document_number,
            items: Array.isArray(itemsRaw) ? itemsRaw : [],
          } as Parameters<typeof DocumentDetail>[0]["transaction"]
        }
      />
    </div>
  );
}