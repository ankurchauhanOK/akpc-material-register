export type PincodeLookupResult = {
  pincode: string;
  postOffice: string;
  district: string;
  state: string;
  country: string;
  count: number;
};

type PostalPincodeApiResponse = {
  Status: "Success" | "Error";
  Message: string;
  PostOffice: {
    Name: string;
    DeliveryStatus: "Delivery" | "Non-Delivery";
    District: string;
    State: string;
    Country: string;
  }[];
}[];

/**
 * Look up an Indian pincode via the public postalpincode.in API and return
 * the first Delivery post office as the locality. District/State/Country are
 * stable across the (possibly multiple) post offices under a pincode.
 *
 * Returns null for invalid pincodes, unknown pincodes, or API failures so
 * callers can fall back silently to manual entry.
 */
export async function lookupPincode(
  pincode: string,
  signal?: AbortSignal
): Promise<PincodeLookupResult | null> {
  const trimmed = pincode.trim();
  if (!/^\d{6}$/.test(trimmed)) return null;

  try {
    const res = await fetch(
      `https://api.postalpincode.in/pincode/${trimmed}`,
      { signal }
    );
    if (!res.ok) return null;

    const body = (await res.json()) as PostalPincodeApiResponse;
    const entry = body?.[0];
    if (!entry || entry.Status !== "Success" || !entry.PostOffice?.length)
      return null;

    const offices = entry.PostOffice;
    const pick =
      offices.find((o) => o.DeliveryStatus === "Delivery") ?? offices[0];

    return {
      pincode: trimmed,
      postOffice: pick.Name,
      district: pick.District,
      state: pick.State,
      country: pick.Country,
      count: offices.length,
    };
  } catch {
    return null;
  }
}