"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon, FolderOpenIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TypeBadge } from "@/components/records/type-badge";
import { useAuth } from "@/hooks/useAuth";
import {
  useTransactions,
  summarizeMovement,
  useActiveMaterials,
  useActiveCompanies,
  type TransactionWithNames,
} from "@/hooks/useTransactions";
import { TransactionEditDialog } from "@/components/records/transaction-edit-dialog";
import { TransactionDetailDialog } from "@/components/records/transaction-detail-dialog";
import { archiveTransaction } from "@/lib/transactions/updateTransaction";
import { formatDate, formatINR, formatPieces } from "@/lib/format";

type FilterType = "all" | "received" | "given";

export function RecordsPage() {
  const { role, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<FilterType>("all");
  const [materialId, setMaterialId] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");

  const [detail, setDetail] = useState<TransactionWithNames | null>(null);
  const [edit, setEdit] = useState<TransactionWithNames | null>(null);

  const { data: rows = [], isLoading, error } = useTransactions();
  const { items: materials } = useActiveMaterials();
  const { items: companies } = useActiveCompanies();

  const movement = useMemo(() => summarizeMovement(rows), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((t) => {
      if (type !== "all" && t.type !== type) return false;
      if (materialId && t.material_id !== materialId) return false;
      if (companyId && t.company_id !== companyId) return false;
      if (q) {
        const hay = `${t.transaction_number} ${t.material_name} ${t.company_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, type, materialId, companyId]);

  async function handleArchive(t: TransactionWithNames) {
    if (!isAdmin) return;
    if (!confirm(`Archive ${t.transaction_number}? This hides it from the ledger.`)) return;
    try {
      await archiveTransaction(t.id);
      setDetail(null);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch {
      alert("Could not archive the record.");
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Records</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Material movement ledger (received and given).
        </p>
      </div>

      {/* Summary strip — derived, never stored */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <SummaryCard label="Received" value={formatPieces(movement.received)} accent="text-emerald-600" />
        <SummaryCard label="Given" value={formatPieces(movement.given)} accent="text-amber-600" />
        <SummaryCard label="Net" value={formatPieces(movement.net)} accent={movement.net < 0 ? "text-red-600" : "text-zinc-800"} />
      </div>

      {/* Filters */}
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Input
            placeholder="Search number, material, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10"
          />
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as FilterType)}
          className="h-10 rounded-lg border bg-white px-3 text-sm"
        >
          <option value="all">All types</option>
          <option value="received">Received</option>
          <option value="given">Given</option>
        </select>
        <select
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
          className="h-10 rounded-lg border bg-white px-3 text-sm"
        >
          <option value="">All materials</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="h-10 rounded-lg border bg-white px-3 text-sm"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-zinc-500">
          Loading records…
        </div>
      ) : error ? (
        <div className="rounded-xl border bg-red-50 p-8 text-center text-sm text-red-700">
          Could not load records. Please try again.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center">
          <FolderOpenIcon className="mx-auto mb-2 size-8 text-zinc-300" />
          <p className="text-sm text-zinc-500">No records found.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border bg-white md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Pieces</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setDetail(t)}
                  >
                    <TableCell className="font-medium">{t.transaction_number}</TableCell>
                    <TableCell>
                      <TypeBadge type={t.type} />
                    </TableCell>
                    <TableCell>{t.material_name}</TableCell>
                    <TableCell>{t.company_name}</TableCell>
                    <TableCell>{new Intl.NumberFormat("en-IN").format(t.pieces)}</TableCell>
                    <TableCell>{formatINR(t.total_amount)}</TableCell>
                    <TableCell>{formatDate(t.transaction_date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDetail(t)}
                className="flex items-center gap-3 rounded-xl border bg-white p-3 text-left hover:bg-muted/40"
              >
                <Badge variant={t.type === "received" ? "default" : "secondary"}>
                  {t.type === "received" ? "REC" : "GIV"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.material_name}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {t.transaction_number} · {t.company_name} ·{" "}
                    {new Intl.NumberFormat("en-IN").format(t.pieces)} pcs ·{" "}
                    {formatDate(t.transaction_date)}
                  </p>
                </div>
                <ChevronRightIcon className="size-4 shrink-0 text-zinc-400" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* Detail dialog */}
      {detail && (
        <TransactionDetailDialog
          key={`detail-${detail.id}`}
          transaction={detail}
          open={!!detail}
          onOpenChange={(o) => !o && setDetail(null)}
          canEdit={Boolean(role) && (role === "admin" || role === "operator")}
          isAdmin={Boolean(isAdmin)}
          onEdit={() => {
            setEdit(detail);
            setDetail(null);
          }}
          onArchive={() => handleArchive(detail)}
        />
      )}

      {/* Edit dialog */}
      {edit && (
        <TransactionEditDialog
          key={`edit-${edit.id}`}
          transaction={edit}
          open={!!edit}
          onOpenChange={(o) => !o && setEdit(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
          }}
        />
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
    <div className="rounded-xl border bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${accent ?? "text-zinc-800"}`}>{value}</p>
    </div>
  );
}
