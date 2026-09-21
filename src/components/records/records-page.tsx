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
  groupRecordsByDocument,
  useActiveMaterials,
  useActiveCompanies,
  type RecordDocument,
  type TransactionWithNames,
} from "@/hooks/useTransactions";
import { TransactionEditDialog } from "@/components/records/transaction-edit-dialog";
import { TransactionDetailDialog } from "@/components/records/transaction-detail-dialog";
import { deleteTransactionPermanently } from "@/lib/transactions/updateTransaction";
import { removeChallan } from "@/lib/supabase/storage";
import { formatDate, formatPieces } from "@/lib/format";

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
  // v2 document headers are admin-editable only (RLS); operators cannot
  // update receiving_documents, so never offer Edit on them.
  if (transaction.source === "documents") return false;
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

  const [detail, setDetail] = useState<RecordDocument | null>(null);
  const [edit, setEdit] = useState<TransactionWithNames | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<RecordDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: rows = [], isLoading, error } = useTransactions();
  const { items: materials } = useActiveMaterials();
  const { items: companies } = useActiveCompanies();

  // One top-level record per document/challan (never one per item line).
  const records = useMemo(() => groupRecordsByDocument(rows), [rows]);

  const movement = useMemo(() => summarizeMovement(rows), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((doc) => {
      if (type !== "all" && doc.type !== type) return false;
      // A challan matches when ANY of its items belongs to the selected
      // Component Master; component-less (Tools/Other) docs never match.
      if (materialId && !doc.items.some((i) => i.materialId === materialId))
        return false;
      if (companyId && doc.companyId !== companyId) return false;
      if (q) {
        const hay = [
          doc.documentNumber,
          doc.companyName,
          doc.recordCategory ?? "",
          ...doc.items.map((i) => i.materialName),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, search, type, materialId, companyId]);

  function handleDelete(doc: RecordDocument) {
    if (!isAdmin) return;
    setDetail(null);
    setDeleteTarget(doc);
  }

  async function performDelete() {
    if (!isAdmin || deleting || !deleteTarget) return;
    setDeleting(true);
    try {
      // Best-effort challan cleanup before row removal
      if (deleteTarget.challanPath) {
        removeChallan(deleteTarget.challanPath).catch(() => {});
      }
      if (deleteTarget.externalDocumentPath) {
        removeChallan(deleteTarget.externalDocumentPath).catch(() => {});
      }
      await deleteTransactionPermanently(
        deleteTarget.source === "documents"
          ? {
              source: "documents",
              documentId: deleteTarget.documentId ?? "",
            }
          : { source: "transactions", id: deleteTarget.primary.id }
      );
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Record deleted permanently.");
    } catch {
      toast.error("Unable to delete the record. Please try again.");
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
          {/* Desktop table — one row per document/challan */}
          <div className="hidden overflow-hidden rounded-xl border bg-white md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Challan</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total Qty</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((doc) => (
                  <TableRow
                    key={doc.key}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setDetail(doc)}
                  >
                    <TableCell className="font-medium">
                      {doc.documentNumber}
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={doc.type} />
                    </TableCell>
                    <TableCell>{categoryLabel(doc.recordCategory)}</TableCell>
                    <TableCell>{doc.partyName ?? doc.companyName}</TableCell>
                    <TableCell>{pluralItems(doc.itemCount)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {doc.totalQtyDisplay}
                    </TableCell>
                    <TableCell>{formatDate(doc.transactionDate)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetail(doc);
                        }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile document cards */}
          <div className="grid gap-2 md:hidden">
            {filtered.map((doc) => (
              <button
                key={doc.key}
                type="button"
                onClick={() => setDetail(doc)}
                className="block w-full rounded-xl border bg-white p-3 text-left hover:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">
                    {doc.documentNumber}
                  </p>
                  <Badge
                    variant={doc.type === "received" ? "default" : "secondary"}
                  >
                    {doc.type === "received" ? "REC" : "GIV"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {doc.type === "received" ? "Received" : "Given"} ·{" "}
                  {categoryLabel(doc.recordCategory)}
                </p>
                <p className="mt-1 truncate text-sm font-medium">
                  {doc.partyName ?? doc.companyName}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
                  <p className="truncate text-xs text-zinc-500">
                    {pluralItems(doc.itemCount)} · {doc.totalQtyDisplay} ·{" "}
                    {formatDate(doc.transactionDate)}
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-zinc-500">
                    View Details <ChevronRightIcon className="size-3.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Detail dialog */}
      {detail && (
        <TransactionDetailDialog
          key={`detail-${detail.key}`}
          record={detail}
          open={!!detail}
          onOpenChange={(o) => !o && setDetail(null)}
          canEdit={canEditRecord({
            role,
            userId: user?.id,
            transaction: detail.primary,
          })}
          isAdmin={Boolean(isAdmin)}
          onEdit={() => {
            setEdit(detail.primary);
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

      {/* Delete confirmation — acts on the whole document/challan */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogTitle>
            Delete this{" "}
            {deleteTarget?.source === "documents" && deleteTarget?.type === "given"
              ? "challan"
              : "record"}{" "}
            permanently?
          </DialogTitle>
          <DialogDescription>
            {deleteTarget &&
              `This will permanently delete this ${
                deleteTarget.source === "documents" &&
                deleteTarget.type === "given"
                  ? "challan"
                  : "record"
              } and all ${pluralItems(
                deleteTarget.itemCount
              ).toLowerCase()} in it. This action cannot be undone.`}
          </DialogDescription>

          {deleteTarget && (
            <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <TypeBadge type={deleteTarget.type} />
                <span className="font-mono text-xs text-zinc-500">
                  {deleteTarget.documentNumber}
                </span>
              </div>
              <dl className="grid gap-2">
                <Row label="Category" value={categoryLabel(deleteTarget.recordCategory)} />
                <Row
                  label={deleteTarget.type === "received" ? "From" : "To"}
                  value={deleteTarget.partyName ?? deleteTarget.companyName}
                />
                <Row label="Items" value={pluralItems(deleteTarget.itemCount)} />
                <Row label="Total Qty" value={deleteTarget.totalQtyDisplay} />
                <Row label="Date" value={formatDate(deleteTarget.transactionDate)} />
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

function categoryLabel(cat: RecordDocument["recordCategory"]): string {
  if (cat === "manufacturing") return "Manufacturing";
  if (cat === "other") return "Tools / Other";
  return "—";
}

function pluralItems(n: number): string {
  return `${n} ${n === 1 ? "Item" : "Items"}`;
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
