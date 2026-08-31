"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, FolderOpenIcon, SearchIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { UNIT_LABELS, CATEGORY_LABELS } from "@/lib/supabase/types";
import type { Enums, Tables } from "@/lib/supabase/database.types";

type Material = Tables<"materials">;
type ComponentCategory = Enums<"component_category">;

export function ComponentsListPage() {
  const { canCreate } = useAuth();
  const [search, setSearch] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["materials"],
    queryFn: async (): Promise<Material[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Material[];
    },
  });

  const filtered = items.filter((m) =>
    m.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Components</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Open a component to receive, send, and review its documents.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/settings"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white"
          >
            + Add Component
          </Link>
        )}
      </div>

      <div className="relative mb-4 max-w-sm">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
        <Input
          placeholder="Search components…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 pl-9"
        />
      </div>

      {isLoading ? (
        <p className="p-8 text-center text-sm text-zinc-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center">
          <FolderOpenIcon className="mx-auto mb-2 size-8 text-zinc-300" />
          <p className="text-sm text-zinc-500">No components found.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-white">
          {filtered.map((m) => (
            <li key={m.id}>
              <Link
                href={`/components/${m.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {UNIT_LABELS[m.unit]}
                    {m.category
                      ? ` · ${CATEGORY_LABELS[m.category as ComponentCategory]}`
                      : " · Pending"}
                    {m.part_code ? ` · ${m.part_code}` : ""}
                  </p>
                </div>
                <ChevronRightIcon className="size-4 shrink-0 text-zinc-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
