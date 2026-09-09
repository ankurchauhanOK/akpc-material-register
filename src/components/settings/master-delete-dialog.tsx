"use client";

import { Loader2Icon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type DeleteDetailRow = { label: string; value: string };

/**
 * Reusable permanent-delete confirmation dialog (trial mode).
 * Never deletes immediately — the caller owns the destructive action via
 * `onConfirm`. Buttons are disabled + spinner shown while `loading` is true.
 */
export function MasterDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  rows,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  rows: DeleteDetailRow[];
  loading: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !loading && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>

        <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
          <dl className="grid gap-2">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4"
              >
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="text-right font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete Permanently"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}