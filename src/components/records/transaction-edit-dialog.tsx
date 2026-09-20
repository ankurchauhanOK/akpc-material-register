"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  EntityCombobox,
  type PickerItem,
} from "@/components/transactions/entity-combobox";
import { ChallanUploader } from "@/components/transactions/challan-uploader";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import {
  useActiveMaterials,
  useActiveCompanies,
  type TransactionWithNames,
} from "@/hooks/useTransactions";
import { updateTransaction } from "@/lib/transactions/updateTransaction";
import { uploadChallan, removeChallan } from "@/lib/supabase/storage";
import { maybeCompressImage } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

const toPicker = (m: { id: string; name: string }): PickerItem => ({
  id: m.id,
  name: m.name,
});

export function TransactionEditDialog({
  transaction,
  open,
  onOpenChange,
  onSaved,
}: {
  transaction: TransactionWithNames;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { role, canManageMasters } = useAuth();
  const { items: materials } = useActiveMaterials();
  const { items: companies } = useActiveCompanies();

  // v2 documents (receiving_documents) have a different edit surface than
  // legacy transaction rows. By design (RLS + immutable line items), only
  // the header is editable and only the destination + date + party snapshot
  // can change — never a material/component master, quantity, or challan.
  const isV2 =
    transaction.source === "documents" && transaction.document_id != null;

  const [materialId, setMaterialId] = useState<string>(transaction.material_id);
  const [companyId, setCompanyId] = useState<string>(transaction.company_id);
  const [pieces, setPieces] = useState(String(transaction.pieces));
  const [amount, setAmount] = useState(
    transaction.total_amount ? String(transaction.total_amount) : ""
  );
  const [date, setDate] = useState(transaction.transaction_date);
  const [newChallan, setNewChallan] = useState<File | null>(null);
  const [removeChallanFlag, setRemoveChallanFlag] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // v2 header updates are admin-only (RLS). Legacy keeps operator editing.
  const roleAllowed = isV2
    ? role === "admin"
    : role === "admin" || role === "operator";
  // RLS is the real guard; we also surface the same UX hint here.
  // (owner + 24h is enforced server-side by the update policy.)

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!companyId) next.company = "Select a company.";
    if (!date) next.date = "Enter a date.";
    if (!isV2) {
      if (!materialId) next.material = "Select a material.";
      const p = Number(pieces);
      if (!pieces.trim() || !Number.isInteger(p) || p <= 0)
        next.pieces = "Enter a whole number of pieces above 0.";
      const a = Number(amount.replace(/,/g, ""));
      if (amount.trim() && (Number.isNaN(a) || a < 0))
        next.amount = "Enter a valid amount.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!roleAllowed) {
      setErrors({ form: "You do not have permission to edit this record." });
      return;
    }
    if (saving) return;
    if (!validate()) return;

    setSaving(true);
    setErrors({});

    const oldPath = transaction.challan_path;
    let targetPath = removeChallanFlag
      ? ""
      : oldPath;
    let uploadedNewPath: string | null = null;

    try {
      // Upload a new challan BEFORE updating so an edit never leaves the
      // transaction pointing at a nonexistent file.
      if (newChallan) {
        const prepared = await maybeCompressImage(newChallan);
        uploadedNewPath = await uploadChallan(prepared);
        targetPath = uploadedNewPath;
      }

      const party = companies.find((c) => c.id === companyId);

      await updateTransaction(
        isV2
          ? { source: "documents", documentId: transaction.document_id! }
          : { source: "transactions", id: transaction.id },
        {
          materialId: materialId!,
          companyId: companyId!,
          pieces: Number(pieces),
          totalAmount: Number(amount.replace(/,/g, "")) || 0,
          transactionDate: date,
          challanPath: targetPath,
          partySnapshot: party
            ? {
                name: party.name,
                company: party.name,
                location: party.location,
                post: party.post,
                contact: party.contact,
                pincode: party.pincode,
              }
            : undefined,
          partyGstin: party?.gstin ?? null,
          partyState: party?.state ?? null,
        }
      );

      // Update succeeded — clean up the old challan if it was replaced/removed.
      const challanChanged =
        (newChallan && oldPath) || (removeChallanFlag && oldPath);
      if (challanChanged && oldPath && oldPath !== targetPath) {
        await removeChallan(oldPath);
      }

      onSaved();
      onOpenChange(false);
    } catch (e) {
      // If a new challan uploaded but the DB update failed, don't leak an orphan.
      if (uploadedNewPath) {
        await removeChallan(uploadedNewPath);
      }
      setErrors({
        form: e instanceof Error ? e.message : "Could not update the record.",
      });
      setSaving(false);
    }
  }

  const canCreateMasters = Boolean(canManageMasters);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Edit {transaction.transaction_number}</DialogTitle>
        <DialogDescription>
          Type is fixed ({transaction.type === "received" ? "Received" : "Given"}).
          {isV2
            ? " Document records: only destination & date can be edited (line items are locked)."
            : role === "operator" && " Operators can only edit their own records within 24 hours."}
        </DialogDescription>

        <div className="grid gap-4">
          {!isV2 && (
            <Field label="Material" error={errors.material}>
              <EntityCombobox
                items={materials.map(toPicker)}
                selectedId={materialId}
                placeholder="Select material"
                searchPlaceholder="Search material…"
                emptyText="No materials found."
                createLabel="Add material"
                canCreate={canCreateMasters}
                onSelect={(i) => setMaterialId(i.id)}
                onCreate={async (name) => {
                  const supabase = createClient();
                  const { data, error } = await supabase
                    .from("materials")
                    .insert({ name })
                    .select("*")
                    .single();
                  if (error) throw new Error("Could not add material.");
                  const item = toPicker(data as { id: string; name: string });
                  setMaterialId(item.id);
                  return item;
                }}
              />
            </Field>
          )}

          <Field label={transaction.type === "received" ? "From" : "To"} error={errors.company}>
            <EntityCombobox
              items={companies.map(toPicker)}
              selectedId={companyId}
              placeholder="Select company"
              searchPlaceholder="Search company…"
              emptyText="No companies found."
              createLabel="Add company"
              canCreate={canCreateMasters}
              onSelect={(i) => setCompanyId(i.id)}
              onCreate={async (name) => {
                const supabase = createClient();
                const { data, error } = await supabase
                  .from("companies")
                  .insert({ name })
                  .select("*")
                  .single();
                if (error) throw new Error("Could not add company.");
                const item = toPicker(data as { id: string; name: string });
                setCompanyId(item.id);
                return item;
              }}
            />
          </Field>

          {!isV2 && (
            <>
              <Field label="Pieces" error={errors.pieces}>
                <InputGroup>
                  <InputGroupInput
                    inputMode="numeric"
                    placeholder="0"
                    value={pieces}
                    onChange={(e) => setPieces(e.target.value)}
                  />
                  <InputGroupAddon align="inline-end">pcs</InputGroupAddon>
                </InputGroup>
              </Field>

              <Field label="Total amount" error={errors.amount}>
                <InputGroup>
                  <InputGroupAddon align="inline-start">₹</InputGroupAddon>
                  <InputGroupInput
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </InputGroup>
              </Field>
            </>
          )}

          <Field label="Date" error={errors.date}>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11"
            />
          </Field>

          {!isV2 && (
            <Field
              label="Challan"
              error={errors.challan}
              hint={
                removeChallanFlag
                  ? "Challan will be removed."
                  : newChallan
                  ? "A new challan will replace the existing one."
                  : undefined
              }
            >
              {removeChallanFlag ? (
                <p className="text-sm text-zinc-500">
                  Current challan removed. Save to apply.
                </p>
              ) : (
                <ChallanUploader file={newChallan} onChange={setNewChallan} />
              )}
              {transaction.challan_path && !removeChallanFlag && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    Current: challan attached
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoveChallanFlag(true)}
                  >
                    Remove challan
                  </Button>
                </div>
              )}
            </Field>
          )}

          {errors.form ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
            >
              {errors.form}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
