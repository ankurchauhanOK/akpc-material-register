// Shared slug normalization for the document catch-all routes.
//
// Document numbers contain slashes for Send (e.g. AK/2026-27/001) but not
// for legacy (GIV-000001), so the route is a catch-all that reassembles the
// number by joining the slug segments with "/". A trailing "challan" segment
// switches to the A4 challan preview.
//
// URLs are encode-agnostic: Next.js does not split/dedupe an encoded slash
// (%2F) in a dynamic segment, so a client that percent-encodes the number
// arrives as ONE slug segment. We decode the joined value so both the raw
// (AK/2026-27/001/challan) and encoded (%2F) forms resolve to the same row
// instead of 404ing.

export function normalizeSlug(slug: string[]): {
  transactionNumber: string;
  isChallan: boolean;
} {
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