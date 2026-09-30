// Invoice numbers contain slashes (INV/2026-27/001), so the invoice route is a
// catch-all that reassembles the number by joining the slug segments with "/",
// exactly like the document catch-all. A trailing "preview" segment switches to
// the on-screen A4 tax invoice.
//
// This is deliberately a SEPARATE helper from documents/normalize-slug.ts: that
// one strips a "challan" segment, which means nothing here, and the two
// documents have different trailing segments. Keeping them apart means adding a
// variant to one can never break the other.
//
// Like normalizeSlug, the joined value is decoded so both the raw
// (INV/2026-27/001) and percent-encoded (%2F) URL forms resolve to the same
// row instead of 404ing.

const PREVIEW_SUFFIX = "/preview";

export function parseInvoiceSlug(slug: string[]): {
  invoiceNumber: string;
  isPreview: boolean;
} {
  const joined = slug.join("/");
  let decoded = joined;
  try {
    decoded = decodeURIComponent(joined);
  } catch {
    // Malformed percent sequences: keep the raw value rather than crashing.
  }
  const isPreview = decoded.toLowerCase().endsWith(PREVIEW_SUFFIX);
  const invoiceNumber = isPreview
    ? decoded.slice(0, -PREVIEW_SUFFIX.length)
    : decoded;
  return { invoiceNumber, isPreview };
}
