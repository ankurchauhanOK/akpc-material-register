"use client";

import { useRef, useState } from "react";
import { ImagePlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isAcceptedFile, objectUrlForPreview } from "@/lib/image";

/**
 * Large, touch-friendly challan capture/upload area (design.md §11).
 * - Take Photo / Choose Photo / Choose File
 * - image preview + filename
 * - replace / remove
 * The actual upload to storage happens later in the form's save flow so
 * the ordering is guaranteed (validate -> upload -> create). Only the
 * selected File is surfaced to the parent.
 */
export function ChallanUploader({
  file,
  onChange,
  error,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  error?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function pickFile(selected: File | null) {
    if (!selected) return;
    if (!isAcceptedFile(selected)) {
      alert("Please choose a JPG, PNG, WebP or PDF challan file.");
      return;
    }
    // revoke previous preview URL to avoid leaks
    if (preview) URL.revokeObjectURL(preview);
    setPreview(selected.type === "application/pdf" ? null : objectUrlForPreview(selected));
    onChange(selected);
  }

  function clear() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="grid gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />

      {file ? (
        <div className="overflow-hidden rounded-xl border bg-white">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Challan preview"
              className="aspect-[4/3] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-sm text-muted-foreground">
              PDF document
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
            <span className="truncate text-sm text-muted-foreground">
              {file.name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={clear}>
              <XIcon />
              <span className="sr-only">Remove</span>
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm transition-colors",
            "border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50 touch-manipulation",
            error && "border-red-300"
          )}
        >
          <ImagePlusIcon className="size-8 opacity-60" />
          <span className="font-medium">Add challan photo (optional)</span>
          <span className="text-xs text-muted-foreground">
            Take photo · choose photo · PDF
          </span>
        </button>
      )}

      {error ? (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
