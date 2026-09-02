import type { Tables, Enums } from "./database.types";

export type Role = Enums<"app_role">;
export type TransactionType = Enums<"transaction_type">;
export type UnitType = Enums<"unit_type">;
export type ComponentCategory = Enums<"component_category">;
export type PartyRole = Enums<"party_role">;
export type DocumentSource = Enums<"document_source">;
export type DocumentKind = Enums<"document_kind">;
export type DocumentLineType = Enums<"document_line_type">;
export type PaymentStatus = Enums<"payment_status">;

export type Profile = Tables<"profiles">;
export type Component = Tables<"materials">;
export type Party = Tables<"companies">;
export type ComponentParty = Tables<"component_parties">;
export type ReceivingDocument = Tables<"receiving_documents">;
export type ReceivingDocumentItem = Tables<"receiving_document_items">;

export const UNIT_TYPES: UnitType[] = ["pieces", "kg", "meter", "litre", "set"];
export const COMPONENT_CATEGORIES: ComponentCategory[] = ["direct", "indirect"];
export const PARTY_ROLES: PartyRole[] = ["customer", "supplier", "both"];
export const DOCUMENT_SOURCES: DocumentSource[] = ["supplier", "shop"];
export const DOCUMENT_KINDS: DocumentKind[] = ["raw-material", "other"];
export const DOCUMENT_LINE_TYPES: DocumentLineType[] = ["component", "other"];
export const PAYMENT_STATUSES: PaymentStatus[] = ["pending", "paid"];
export const GST_PERCENTS: number[] = [0, 5, 12, 18, 28];

export const UNIT_LABELS: Record<UnitType, string> = {
  pieces: "Pieces",
  kg: "Kg",
  meter: "Meter",
  litre: "Litre",
  set: "Set",
};

export const SOURCE_LABELS: Record<DocumentSource, string> = {
  supplier: "Supplier",
  shop: "Shop",
};

export const KIND_LABELS: Record<DocumentKind, string> = {
  "raw-material": "Raw Material",
  other: "Other",
};

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
};

export const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  direct: "Direct",
  indirect: "Indirect",
};

export const ROLE_LABELS: Record<PartyRole, string> = {
  customer: "Customer",
  supplier: "Supplier",
  both: "Both",
};

// Role order ranks privilege (higher = more access).
export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

export function roleAtLeast(role: Role | null | undefined, min: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

// -------- Permission helpers (UX layer only; RLS is the real boundary) --------

export const Permissions = {
  /** Can create transactions (receive/give). */
  canCreate: (role?: Role | null) => roleAtLeast(role, "operator"),

  /** Can edit a transaction owned by the user. Operators: only recent own. */
  canEditTransaction: (
    role: Role | null | undefined,
    isOwner: boolean,
    createdWithin24h: boolean
  ): boolean => {
    if (role === "admin") return true;
    if (role === "operator") return isOwner && createdWithin24h;
    return false;
  },

  /** Can manage/create/edit materials & companies. */
  canManageMasters: (role?: Role | null) => roleAtLeast(role, "operator"),

  /** Can archive/soft-delete + manage users. */
  isAdmin: (role?: Role | null) => role === "admin",
} as const;
