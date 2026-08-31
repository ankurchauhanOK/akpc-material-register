"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  PlusIcon,
  FolderOpenIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTransactions } from "@/hooks/useTransactions";
import { useComponentParties } from "@/hooks/useMasters";
import { Input } from "@/components/ui/input";
import { TypeBadge } from "@/components/records/type-badge";
import { formatDate, formatINR } from "@/lib/format";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import { UNIT_LABELS, CATEGORY_LABELS } from "@/lib/supabase/types";

type Material = Tables<"materials">;
type ComponentCategory = Enums<"component_category">;
type FilterType = "all" | "received" | "given";

export function ComponentDashboard({ component }: { component: Material }) {
  const { canCreate } = useAuth();
  const { data: allRows = [], isLoading } = useTransactions();
  const { items: parties } = useComponentParties(component.id);

  const [search, setSearch] = useState("");
  const [type, setType] = useState<FilterType>("all");
  const [partyId, setPartyId] = useState<string>("");

  const rows = useMemo(
    () => allRows.filter((t) => t.material_id === component.id),
    [allRows, component.id]
  );

  // distinct parties that have moved with this component (from history)
  const historyParties = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of rows) map.set(t.company_id, t.company_name);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((t) => {
      if (type !== "all" && t.type !== type) return false;
      if (partyId && t.company_id !== partyId) return false;
      if (q) {
        const hay = `${t.transaction_number} ${t.company_name} ${t.challan_number ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, type, partyId]);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-5 rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{component.name}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Unit: {UNIT_LABELS[component.unit]}
              {component.category
                ? ` · ${CATEGORY_LABELS[component.category as ComponentCategory]}`
                : " · Category pending"}
              {component.part_code ? ` · Part: ${component.part_code}` : ""}
              {!component.is_active && " · Inactive"}
            </p>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-5 grid grid-cols-3 gap-2">
        <Link
          href={`/components/${component.id}/receive`}
          className="flex h-14 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <ArrowDownLeftIcon className="size-4" /> Receive
        </Link>
        <Link
          href={`/components/${component.id}/send`}
          className="flex h-14 items-center justify-center gap-1.5 rounded-xl bg-amber-600 text-sm font-semibold text-white hover:bg-amber-700"
        >
          <ArrowUpRightIcon className="size-4" /> Send
        </Link>
        <Link
          href="/settings"
          className="flex h-14 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold hover:bg-muted"
        >
          <PlusIcon className="size-4" /> Add Party
        </Link>
      </div>
      {!canCreate && (
        <p className="mb-5 -mt-3 text-xs text-zinc-400">
          You have read-only access. Receive/Send require an operator or admin account.
        </p>
      )}

      {/* Parties */}
      <div className="mb-5 rounded-xl border bg-white">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Parties</h2>
        </div>
        {parties.length === 0 ? (
          <p className="p-5 text-sm text-zinc-400">
            No parties linked yet. Parties appear here once you record a movement with them.
          </p>
        ) : (
          <ul className="divide-y">
            {parties.map((cp) => (
              <li key={cp.party_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium">{cp.party?.name ?? "—"}</span>
                {cp.party?.location && (
                  <span className="text-xs text-zinc-500">{cp.party.location}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Documents */}
      <div className="rounded-xl border bg-white">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Documents</h2>
        </div>
        <div className="grid gap-2 border-b p-3 sm:grid-cols-3">
          <Input
            placeholder="Search number, party, challan…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FilterType)}
            className="h-10 rounded-lg border bg-white px-3 text-sm"
          >
            <option value="all">Receive / Send</option>
            <option value="received">Received</option>
            <option value="given">Sent</option>
          </select>
          <select
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            className="h-10 rounded-lg border bg-white px-3 text-sm"
          >
            <option value="">All parties</option>
            {historyParties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-zinc-500">Loading documents…</p>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <FolderOpenIcon className="mx-auto mb-2 size-8 text-zinc-300" />
            <p className="text-sm text-zinc-500">No documents for this component.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <TypeBadge type={t.type} />
                    <span className="truncate text-sm font-medium">{t.transaction_number}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {t.company_name} · {formatDate(t.transaction_date)} ·{" "}
                    {t.challan_number ? `Challan ${t.challan_number} · ` : ""}
                    {t.pieces} {t.material_unit ?? component.unit}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {t.total_amount > 0 && (
                    <p className="text-sm font-medium">{formatINR(t.total_amount)}</p>
                  )}
                  <Link
                    href={`/components/${component.id}/documents/${t.transaction_number}`}
                    className="text-xs font-medium text-emerald-600 hover:underline"
                  >
                    View challan
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
