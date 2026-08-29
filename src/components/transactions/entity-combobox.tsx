"use client";

import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PickerItem = {
  id: string;
  name: string;
};

/**
 * Searchable single-select picker with inline creation.
 * Used for Materials and Companies (design.md §10 — smart data entry).
 * The trigger button shows the current selection and opens a search dialog.
 */
export function EntityCombobox({
  items,
  selectedId,
  placeholder,
  searchPlaceholder,
  emptyText,
  createLabel,
  canCreate,
  onSelect,
  onCreate,
  trigger,
}: {
  items: PickerItem[];
  selectedId: string | null;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  createLabel: string;
  canCreate: boolean;
  onSelect: (item: PickerItem) => void;
  onCreate: (name: string) => Promise<PickerItem>;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId]
  );

  const trimmed = query.trim();
  const filtered = useMemo(() => {
    if (!trimmed) return items;
    const q = trimmed.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, trimmed]);

  const canCreateValue = canCreate && trimmed.length > 0;
  const exactMatchExists = items.some(
    (i) => i.name.toLowerCase() === trimmed.toLowerCase()
  );

  async function handleCreate() {
    if (!canCreateValue || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const item = await onCreate(trimmed);
      onSelect(item);
      setOpen(false);
      setQuery("");
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : "Could not create. Please try again."
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger ? (
          <DialogTrigger render={trigger as ReactElement} />
        ) : (
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full justify-between font-normal"
                aria-label={placeholder}
              >
                <span
                  className={cn(
                    "truncate text-left",
                    !selected && "text-muted-foreground"
                  )}
                >
                  {selected ? selected.name : placeholder}
                </span>
              </Button>
            }
          />
        )}
        <DialogContent className="p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">{placeholder}</DialogTitle>
          <Command>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
              autoFocus
            />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              {filtered.length > 0 && (
                <CommandGroup>
                  {filtered.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.name}
                      onSelect={() => {
                        onSelect(item);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      {item.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {canCreateValue && !exactMatchExists && (
                <CommandGroup>
                  <CommandItem
                    value={`__create__${trimmed}`}
                    onSelect={() => handleCreate()}
                  >
                    <PlusIcon />
                    <span>
                      {createLabel} &quot;
                      <span className="font-medium">{trimmed}</span>&quot;
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
          {creating ? (
            <p className="border-t px-2 py-1 text-center text-sm text-muted-foreground">
              Saving…
            </p>
          ) : null}
          {createError ? (
            <p
              role="alert"
              className="border-t px-2 py-1 text-center text-sm font-medium text-red-600"
            >
              {createError}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
