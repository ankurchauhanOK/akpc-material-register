"use client";

import Link from "next/link";
import { UsersIcon, ChevronRightIcon } from "lucide-react";
import type { Component } from "@/lib/supabase/types";
import { UNIT_LABELS, CATEGORY_LABELS } from "@/lib/supabase/types";
import type { Enums } from "@/lib/supabase/database.types";

type Category = Enums<"component_category">;

export function MasterComponents({
  components,
  partyCounts,
}: {
  components: Component[];
  partyCounts: Map<string, number>;
}) {
  const preview = components.slice(0, 5);

  return (
    <section>
      {/* Mobile header */}
      <div className="mb-2.5 flex items-center justify-between lg:hidden">
        <h3 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">
          Master Components
        </h3>
        <Link
          href="/components"
          className="inline-flex items-center gap-0.5 text-[13px] font-medium text-emerald-700 hover:underline"
        >
          View all
          <ChevronRightIcon className="size-3.5" />
        </Link>
      </div>

      {/* Desktop header */}
      <div className="mb-2.5 hidden items-center justify-between lg:flex">
        <h2 className="text-[17px] font-semibold tracking-tight text-foreground">
          Master Components
        </h2>
        <Link
          href="/components"
          className="inline-flex items-center gap-0.5 text-[13px] font-medium text-emerald-700 hover:underline"
        >
          View all
          <ChevronRightIcon className="size-3.5" />
        </Link>
      </div>

      {preview.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-white p-6 text-center text-sm text-muted-foreground">
          No components yet. Add your first component in Settings.
        </div>
      ) : (
        <>
          {/* Mobile: compact 3-col grid with aspect-square cards */}
          <div className="grid grid-cols-3 gap-2 lg:hidden">
            {preview.map((c) => (
              <Link
                key={c.id}
                href={`/components/${c.id}`}
                className="group flex aspect-square flex-col items-start justify-center rounded-xl border border-border bg-white p-2.5 transition-colors hover:border-emerald-200 hover:bg-emerald-50/40"
              >
                <span className="truncate text-[14px] font-semibold leading-tight text-foreground">
                  {c.name}
                </span>
                <span className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {UNIT_LABELS[c.unit]}
                </span>
                <span className="mt-auto rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 uppercase">
                  Active
                </span>
              </Link>
            ))}
          </div>

          {/* Desktop: 5-col grid with richer cards */}
          <div className="hidden grid-cols-1 gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-5">
            {preview.map((c) => {
              const parties = partyCounts.get(c.id) ?? 0;
              return (
                <Link
                  key={c.id}
                  href={`/components/${c.id}`}
                  className="group rounded-2xl border border-border bg-white p-3.5 transition-colors hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  {c.part_code ? (
                    <p className="text-[11px] font-semibold tracking-wide text-emerald-700">
                      {c.part_code}
                    </p>
                  ) : (
                    <p className="text-[11px] font-semibold tracking-wide text-zinc-300">—</p>
                  )}
                  <p className="mt-1 truncate text-[14px] font-semibold text-foreground">
                    {c.name}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {UNIT_LABELS[c.unit]}
                    {c.category
                      ? ` · ${CATEGORY_LABELS[c.category as Category]}`
                      : " · Pending"}
                  </p>
                  <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <UsersIcon className="size-3" />
                    {parties} {parties === 1 ? "party" : "parties"}
                  </p>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
