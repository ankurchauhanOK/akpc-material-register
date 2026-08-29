"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useTransactions,
  summarizeMovement,
  summarizeByMaterial,
  type TransactionWithNames,
} from "@/hooks/useTransactions";
import { TypeBadge } from "@/components/records/type-badge";
import { formatPieces } from "@/lib/format";

function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function monthPrefix() {
  return todayISO().slice(0, 7); // YYYY-MM
}

function timeOfDayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardPage() {
  const { profile, role } = useAuth();
  const { data: rows = [], isLoading, error } = useTransactions();

  const today = todayISO();
  const month = monthPrefix();

  const todayTxs = useMemo(
    () => rows.filter((t) => t.transaction_date === today),
    [rows, today]
  );
  const monthTxs = useMemo(
    () => rows.filter((t) => t.transaction_date.startsWith(month)),
    [rows, month]
  );

  const todayM = useMemo(() => summarizeMovement(todayTxs), [todayTxs]);
  const monthM = useMemo(() => summarizeMovement(monthTxs), [monthTxs]);
  const byMaterial = useMemo(
    () => summarizeByMaterial(rows).slice(0, 6),
    [rows]
  );
  const recent = useMemo(() => rows.slice(0, 5), [rows]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {timeOfDayGreeting()}, {firstName}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {role ? role[0].toUpperCase() + role.slice(1) : ""} · Material dashboard
          </p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link
          href="/receive"
          className="flex h-16 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
        >
          <ArrowDownLeftIcon className="size-5" /> + Receive Material
        </Link>
        <Link
          href="/give"
          className="flex h-16 items-center justify-center gap-2 rounded-xl bg-amber-600 text-base font-semibold text-white hover:bg-amber-700"
        >
          <ArrowUpRightIcon className="size-5" /> − Give Material
        </Link>
      </div>

      {isLoading ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-zinc-500">
          Loading dashboard…
        </div>
      ) : error ? (
        <div className="rounded-xl border bg-red-50 p-8 text-center text-sm text-red-700">
          Could not load dashboard data.
        </div>
      ) : (
        <div className="grid gap-6">
          {/* Today / month summary */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard label="Received today" value={formatPieces(todayM.received)} accent="text-emerald-600" />
            <SummaryCard label="Given today" value={formatPieces(todayM.given)} accent="text-amber-600" />
            <SummaryCard label="Received this month" value={formatPieces(monthM.received)} accent="text-emerald-600" />
            <SummaryCard label="Given this month" value={formatPieces(monthM.given)} accent="text-amber-600" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Net material movement */}
            <div className="rounded-xl border bg-white">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Net material movement</h2>
              </div>
              {byMaterial.length === 0 ? (
                <p className="p-6 text-sm text-zinc-400">No movement yet.</p>
              ) : (
                <ul className="divide-y">
                  {byMaterial.map((m) => (
                    <li key={m.material_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span>{m.material_name}</span>
                      <span className={m.net < 0 ? "font-medium text-red-600" : "font-medium text-zinc-800"}>
                        {m.net < 0 ? "−" : "+"}
                        {new Intl.NumberFormat("en-IN").format(Math.abs(m.net))} pcs
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Recent transactions */}
            <div className="rounded-xl border bg-white">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Recent transactions</h2>
                <Link href="/records" className="text-xs font-medium text-emerald-600 hover:underline">
                  View all
                </Link>
              </div>
              {recent.length === 0 ? (
                <p className="p-6 text-sm text-zinc-400">No transactions yet.</p>
              ) : (
                <ul className="divide-y">
                  {recent.map((t) => (
                    <RecentRow key={t.id} t={t} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${accent ?? "text-zinc-800"}`}>{value}</p>
    </div>
  );
}

function RecentRow({ t }: { t: TransactionWithNames }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 font-medium text-zinc-500">{t.transaction_number}</span>
        <TypeBadge type={t.type} />
        <span className="truncate">{t.material_name}</span>
      </div>
      <span className="shrink-0 text-muted-foreground">
        {new Intl.NumberFormat("en-IN").format(t.pieces)} pcs
      </span>
    </li>
  );
}
