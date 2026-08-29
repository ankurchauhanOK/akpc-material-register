import type { Tables, Enums } from "./database.types";

export type Role = Enums<"app_role">;
export type TransactionType = Enums<"transaction_type">;

export type Profile = Tables<"profiles">;

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
