"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  PlusIcon,
  FolderOpenIcon,
  SearchIcon,
  FilterIcon,
  UsersIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTransactions, summarizeMovement } from "@/hooks/useTransactions";
import { useComponentParties } from "@/hooks/useMasters";
import { useMobileHeaderTitle } from "@/components/layout/mobile-header-context";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import { UNIT_LABELS, CATEGORY_LABELS, ROLE_LABELS } from "@/lib/supabase/types";

type Material = Tables<"materials">;
type ComponentCategory = Enums<"component_category">;
type PartyRole = Enums<"party_role">;
type FilterType = "all" | "received" | "given";

function formatPieces(n: number): string {
  return `${new Intl.NumberFormat("en-IN").format(n)} pcs`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function ComponentDashboard({ component }: { component: Material }) {
  const { canCreate } = useAuth();
  const { data: allRows = [], isLoading } = useTransactions();
  const { items: parties } = useComponentParties(component.id);
  const { setTitle } = useMobileHeaderTitle();

  useEffect(() => {
    setTitle(component.name);
    return () => setTitle(null);
  }, [component.name, setTitle]);

  const [search, setSearch] = useState("");
  const [type, setType] = useState<FilterType>("all");

  const rows = useMemo(
    () => allRows.filter((t) => t.material_id === component.id),
    [allRows, component.id]
  );

  const movement = useMemo(() => summarizeMovement(rows), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((t) => {
      if (type !== "all" && t.type !== type) return false;
      if (q) {
        const hay = `${t.transaction_number} ${t.company_name} ${t.party_name ?? ""} ${t.challan_number ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, type]);

  const showAllParties = parties.length > 4;
  const visibleParties = showAllParties ? parties.slice(0, 4) : parties;

  return (
    <div className="flex flex-col gap-4">
      {/* Component identity header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-baseline gap-2 text-[26px] leading-tight font-semibold tracking-tight text-foreground">
            {component.name}
            {component.part_code && (
              <span className="text-[16px] font-medium text-muted-foreground">
                {component.part_code}
              </span>
            )}
          </h1>
          <p className="mt-1 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
            {component.category
              ? CATEGORY_LABELS[component.category as ComponentCategory]
              : "Category pending"}{" "}
            <span className="text-muted-foreground/70">·</span>{" "}
            {UNIT_LABELS[component.unit]}
            {!component.is_active && (
              <span className="text-muted-foreground/70"> · Inactive</span>
            )}
          </p>
        </div>

        {/* Desktop actions (rail present at lg+). Receive/Send only; Add Party
            lives inside the Parties card. Receive/Send are disabled (not hidden)
            for read-only viewers. */}
        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href={`/components/${component.id}/receive`}
            aria-disabled={!canCreate}
            className={`inline-flex h-[42px] items-center gap-1.5 rounded-[12px] px-3.5 text-[13px] font-semibold text-white transition-colors ${canCreate ? "bg-akpc-receive hover:brightness-110" : "pointer-events-none bg-akpc-receive/50 text-white/70"}`}
          >
            <ArrowDownLeftIcon className="size-4" /> Receive
          </Link>
          <Link
            href={`/components/${component.id}/send`}
            aria-disabled={!canCreate}
            className={`inline-flex h-[42px] items-center gap-1.5 rounded-[12px] px-3.5 text-[13px] font-semibold text-white transition-colors ${canCreate ? "bg-akpc-send hover:brightness-110" : "pointer-events-none bg-akpc-send/50 text-white/70"}`}
          >
            <ArrowUpRightIcon className="size-4" /> Send
          </Link>
        </div>
      </div>

      {/* Mobile primary actions: two equal, thumb-reachable 46px CTAs. */}
      <div className="grid grid-cols-2 gap-2 lg:hidden">
        <Link
          href={`/components/${component.id}/receive`}
          aria-disabled={!canCreate}
          className={`flex min-h-[46px] items-center justify-center gap-2 rounded-[14px] px-4 text-[14px] font-semibold text-white transition-colors ${canCreate ? "bg-akpc-receive hover:brightness-110" : "pointer-events-none bg-akpc-receive/50 text-white/70"}`}
        >
          <ArrowDownLeftIcon className="size-4" /> Receive
        </Link>
        <Link
          href={`/components/${component.id}/send`}
          aria-disabled={!canCreate}
          className={`flex min-h-[46px] items-center justify-center gap-2 rounded-[14px] px-4 text-[14px] font-semibold text-white transition-colors ${canCreate ? "bg-akpc-send hover:brightness-110" : "pointer-events-none bg-akpc-send/50 text-white/70"}`}
        >
          <ArrowUpRightIcon className="size-4" /> Send
        </Link>
      </div>

      {/* Top information row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[9fr_11fr]">
        {/* Movement Summary */}
        <section className="rounded-[16px] border border-border bg-white p-4">
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
            <UsersIcon className="size-4 text-muted-foreground" />
            Movement Summary
          </h2>
          <div className="mt-2 flex items-center justify-center">
            <div className="flex-1 text-center">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Total Received
              </p>
              <p className="mt-1 text-[20px] font-semibold text-emerald-700">
                {formatPieces(movement.received)}
              </p>
            </div>
            <span className="mx-2 h-10 w-px bg-border" />
            <div className="flex-1 text-center">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Total Sent
              </p>
              <p className="mt-1 text-[20px] font-semibold text-orange-600">
                {formatPieces(movement.given)}
              </p>
            </div>
          </div>
        </section>

        {/* Parties */}
        <section className="rounded-[16px] border border-border bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
              <UsersIcon className="size-4 text-muted-foreground" />
              Parties
            </h2>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 hover:underline"
            >
              <PlusIcon className="size-3.5" /> Add Party
            </Link>
          </div>
          {visibleParties.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-white/60 p-4 text-center">
              <p className="text-sm text-muted-foreground">No parties linked yet.</p>
              <p className="mt-1 text-xs text-muted-foreground/80">
                Add a party in Settings to link them here.
              </p>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {visibleParties.map((cp) => {
                const party = cp.party;
                return (
                  <li key={cp.party_id} className="flex items-center gap-2.5 py-1.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded bg-zinc-100 text-[11px] font-semibold text-muted-foreground">
                      {party?.name ? initials(party.name) : "?"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                      {party?.name ?? "—"}
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                      {party?.role
                        ? ROLE_LABELS[party.role as PartyRole]
                        : "Unclassified"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {showAllParties && (
            <Link
              href="/settings"
              className="mt-2 inline-flex items-center text-[12px] font-medium text-emerald-700 hover:underline"
            >
              View All Parties →
            </Link>
          )}
        </section>
      </div>

      {/* Document Center */}
      <section className="rounded-[16px] border border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
            <FolderOpenIcon className="size-4 text-muted-foreground" />
            Document Center
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-52">
              <SearchIcon className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search documents…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full pl-8 sm:w-52"
                aria-label="Search documents"
              />
            </div>
            <div className="relative">
              <FilterIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FilterType)}
                className="h-9 w-full rounded-[8px] border border-border bg-white pl-8 pr-7 text-[13px] text-foreground sm:w-auto"
                aria-label="Filter by type"
              >
                <option value="all">All types</option>
                <option value="received">Receive</option>
                <option value="given">Send</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading documents…</p>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center lg:p-10">
            <FolderOpenIcon className="mx-auto mb-2 size-7 text-zinc-300 lg:size-8" />
            <p className="text-sm text-muted-foreground">No documents for this component.</p>
            {canCreate && (
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/components/${component.id}/receive`}
                  className="inline-flex h-11 items-center gap-1.5 rounded-[12px] bg-akpc-receive px-3 text-[13px] font-semibold text-white"
                >
                  <ArrowDownLeftIcon className="size-4" /> Receive
                </Link>
                <Link
                  href={`/components/${component.id}/send`}
                  className="inline-flex h-11 items-center gap-1.5 rounded-[12px] bg-akpc-send px-3 text-[13px] font-semibold text-white"
                >
                  <ArrowUpRightIcon className="size-4" /> Send
                </Link>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table — hidden below lg (mobile uses the card list below). */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    <th className="px-4 py-2.5 font-medium">Document ID</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Party</th>
                    <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((t) => (
                    <tr key={t.id} className="h-[44px] hover:bg-muted/40">
                      <td className="px-4 py-2 font-medium text-foreground">
                        {t.transaction_number}
                      </td>
                      <td className="px-4 py-2 text-[13px] text-muted-foreground">
                        {formatDate(t.transaction_date)}
                      </td>
                      <td className="px-4 py-2 text-[13px]">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            t.type === "received"
                              ? "text-emerald-700"
                              : "text-orange-600"
                          }`}
                        >
                          {t.type === "received" ? (
                            <ArrowDownLeftIcon className="size-3.5" />
                          ) : (
                            <ArrowUpRightIcon className="size-3.5" />
                          )}
                          {t.type === "received" ? "Receive" : "Send"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-[13px] text-foreground">
                        {t.party_name || t.company_name}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-medium ${
                          t.type === "received"
                            ? "text-emerald-700"
                            : "text-orange-600"
                        }`}
                      >
                        {t.type === "received" ? "+" : "−"}
                        {new Intl.NumberFormat("en-IN").format(t.pieces)}
                      </td>
                      <td className="px-4 py-2 text-right text-[13px] text-foreground">
                        {t.total_amount > 0 ? formatINR(t.total_amount) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/components/${component.id}/documents/${t.transaction_number}`}
                          className="text-[12px] font-medium text-emerald-700 hover:underline"
                        >
                          View challan
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-border lg:hidden">
              {filtered.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                        t.type === "received"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-orange-50 text-orange-600"
                      }`}
                    >
                      {t.type === "received" ? (
                        <ArrowDownLeftIcon className="size-3.5" />
                      ) : (
                        <ArrowUpRightIcon className="size-3.5" />
                      )}
                    </span>
                    <span className="flex-1 truncate text-[13px] font-semibold text-foreground">
                      {t.transaction_number}
                    </span>
                    <span
                      className={`text-[13px] font-medium ${
                        t.type === "received"
                          ? "text-emerald-700"
                          : "text-orange-600"
                      }`}
                    >
                      {t.type === "received" ? "+" : "−"}
                      {new Intl.NumberFormat("en-IN").format(t.pieces)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span>{formatDate(t.transaction_date)}</span>
                    <span className="text-muted-foreground/60">·</span>
                    <span className="truncate">{t.party_name || t.company_name}</span>
                    <span className="text-muted-foreground/60">·</span>
                    {t.total_amount > 0 ? (
                      <span className="font-medium">{formatINR(t.total_amount)}</span>
                    ) : (
                      <span>—</span>
                    )}
                  </div>
                  <Link
                    href={`/components/${component.id}/documents/${t.transaction_number}`}
                    className="mt-1 inline-block text-[12px] font-medium text-emerald-700"
                  >
                    View challan →
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function formatDate(date: string): string {
  const d = new Date(date + (date.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}