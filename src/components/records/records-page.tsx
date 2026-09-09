"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon, FolderOpenIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import type { Role } from "@/lib/supabase/types";
import {
  useTransactions,
  summarizeMovement,
  useActiveMaterials,
  useActiveCompanies,
  type TransactionWithNames,
} from "@/hooks/useTransactions";
import { TransactionEditDialog } from "@/components/records/transaction-edit-dialog";
import { TransactionDetailDialog } from "@/components/records/transaction-detail-dialog";
import { deleteTransactionPermanently } from "@/lib/transactions/updateTransaction";
import { removeChallan } from "@/lib/supabase/storage";
import { formatDate, formatINR, formatPieces } from "@/lib/format";

type FilterType = "all" | "received" | "given";

// Mirror the DB update policy client-side so operators only see Edit on
// records they can actually update (owner + within 24h). RLS is still the
// real authority — this just avoids a confusing silent rejection.
function canEditRecord({
  role,
  userId,
  transaction,
}: {
  role: Role | null;
  userId?: string | undefined;
  transaction: TransactionWithNames;
}): boolean {
  if (role === "admin") return true;
  if (role !== "operator" || !userId) return false;
  if (transaction.created_by !== userId) return false;
  const windowMs = 24 * 60 * 60 * 1000;
  return Date.now() - new Date(transaction.created_at).getTime() <= windowMs;
}

export function RecordsPage() {
  const { role, isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<FilterType>("all");
  const [materialId, setMaterialId] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");

  const [detail, setDetail] = useState<TransactionWithNames | null>(null);
  const [edit, setEdit] = useState<TransactionWithNames | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<TransactionWithNames | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  function handleDelete(t: TransactionWithNames) {
    if (!isAdmin) return;
    setDetail(null);
    setDeleteTarget(t);
  }

  async function performDelete() {
    if (!isAdmin || deleting || !deleteTarget) return;
    setDeleting(true);
    try {
      // Best-effort challan cleanup before row removal
      if (deleteTarget.challan_path) {
        removeChallan(deleteTarget.challan_path).catch(() => {});
      }
      if (deleteTarget.external_document_path) {
        removeChallan(deleteTarget.external_document_path).catch(() => {});
      }
      await deleteTransactionPermanently(deleteTarget.id);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction deleted permanently.");
    } catch {
      toast.error("Unable to delete the transaction. Please try again.");
    } finally {
      setDeleting(false);
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
          canEdit={canEditRecord({
            role,
            userId: user?.id,
            transaction: detail,
          })}
          isAdmin={Boolean(isAdmin)}
          onEdit={() => {
            setEdit(detail);
            setDetail(null);
          }}
          onDelete={() => handleDelete(detail)}
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

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogTitle>Delete this transaction permanently?</DialogTitle>
          <DialogDescription>
            This will permanently remove this transaction and all of its stored
            data. This action cannot be undone.
          </DialogDescription>

          {deleteTarget && (
            <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <TypeBadge type={deleteTarget.type} />
                <span className="font-mono text-xs text-zinc-500">
                  {deleteTarget.transaction_number}
                </span>
              </div>
              <dl className="grid gap-2">
                <Row label="Component" value={deleteTarget.material_name} />
                <Row
                  label={deleteTarget.type === "received" ? "From" : "To"}
                  value={deleteTarget.company_name}
                />
                <Row
                  label="Quantity"
                  value={`${new Intl.NumberFormat("en-IN").format(
                    deleteTarget.pieces
                  )} pcs`}
                />
                <Row
                  label="Date"
                  value={formatDate(deleteTarget.transaction_date)}
                />
              </dl>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={performDelete}
            >
              {deleting ? (
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
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
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
