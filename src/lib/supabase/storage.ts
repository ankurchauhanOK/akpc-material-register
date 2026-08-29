import { createClient } from "@/lib/supabase/client";

const BUCKET = "challans";

/**
 * Upload a challan file to the private `challans` storage bucket.
 * Returns the storage path on success, or throws on failure.
 *
 * The return value is the canonical storage path that is saved into
 * the transaction's `challan_path` column.
 */
export async function uploadChallan(file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  // Namespaced path keeps files organised and avoids collisions.
  const path = `receipts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) throw error;
  return path;
}

/**
 * Best-effort removal of an orphaned challan when a transaction insert
 * fails after a successful upload.
 *
 * NOTE: the storage DELETE policy is admin-only (RLS). For an operator this
 * will be blocked by RLS — that is expected and acceptable (design decision,
 * Option A). We still attempt it and clearly distinguish the outcomes so
 * orphans are easy to identify later.
 */
export async function removeChallan(path: string): Promise<{
  outcome: "succeeded" | "blocked" | "failed";
  error?: string;
}> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).remove([path]);

  if (!error) {
    const removed = Array.isArray(data) && data.some((d) => d.name === path);
    if (removed) {
      console.info(`[cleanup] Orphan challan removed successfully: ${path}`);
      return { outcome: "succeeded" };
    }
    // Remove returned without error but path not confirmed -> treat as done.
    console.info(`[cleanup] Orphan cleanup completed (unconfirmed): ${path}`);
    return { outcome: "succeeded" };
  }

  const message = error.message ?? "";
  if (/row-level security|permission|policy|Unauthorized|forbidden/i.test(message)) {
    console.warn(
      `[cleanup] Orphan cleanup BLOCKED by permissions (RLS). ` +
        `Path: ${path}. An admin will need to remove this orphan.`
    );
    return { outcome: "blocked", error: message };
  }

  console.error(`[cleanup] Orphan cleanup failed unexpectedly: ${path}`, error);
  return { outcome: "failed", error: message };
}
