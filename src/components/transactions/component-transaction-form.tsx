"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, RotateCcwIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
import { useActiveParties } from "@/hooks/useMasters";
import { createTransaction } from "@/lib/transactions/createTransaction";
import { uploadChallan, removeChallan } from "@/lib/supabase/storage";
import { maybeCompressImage } from "@/lib/image";
import { formatDate, formatINR } from "@/lib/format";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import { UNIT_LABELS, CATEGORY_LABELS } from "@/lib/supabase/types";

type Material = Tables<"materials">;
type Party = Tables<"companies">;
type ComponentCategory = Enums<"component_category">;
type Direction = Extract<Enums<"transaction_type">, "received" | "given">;

const toPicker = (p: { id: string; name: string }): PickerItem => ({
  id: p.id,
  name: p.name,
});

function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

type PartyWithDetails = Party & { name: string };

export function ComponentTransactionForm({
  component,
  direction,
}: {
  component: Material;
  direction: Direction;
}) {
  const router = useRouter();
  const { user, canCreate } = useAuth();
  const queryClient = useQueryClient();
  const { items: parties } = useActiveParties();

  const isReceive = direction === "received";
  const verb = isReceive ? "Receive" : "Send";

  const [partyId, setPartyId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [challanNumber, setChallanNumber] = useState("");
  const [externalDoc, setExternalDoc] = useState<File | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Tables<"transactions"> | null>(null);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  const selectedParty: PartyWithDetails | undefined = parties.find(
    (p) => p.id === partyId
  );

  const createParty = useMutation({
    mutationFn: async (name: string): Promise<PickerItem> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("companies")
        .insert({ name })
        .select("*")
        .single();
      if (error) throw new Error("Could not add party.");
      return toPicker(data as Party);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["companies"] }),
  });

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!partyId) next.party = "Select or add a party.";
    const q = Number(quantity);
    if (!quantity.trim() || Number.isNaN(q) || q <= 0)
      next.quantity = `Enter a quantity above 0 (${UNIT_LABELS[component.unit]}).`;
    const up = unitPrice.trim()
      ? Number(unitPrice.replace(/,/g, ""))
      : null;
    if (unitPrice.trim() && (up === null || Number.isNaN(up) || up < 0))
      next.unitPrice = "Enter a valid unit price.";
    const ta = totalAmount.trim()
      ? Number(totalAmount.replace(/,/g, ""))
      : null;
    if (totalAmount.trim() && (ta === null || Number.isNaN(ta) || ta < 0))
      next.totalAmount = "Enter a valid total amount.";
    if (!date) next.date = "Enter a date.";
    if (isReceive && !challanNumber.trim())
      next.challanNumber = "Enter the source challan number.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!canCreate) {
      setErrors({ form: "You do not have permission to record this." });
      return;
    }
    if (submittingRef.current) return;
    if (!validate()) return;
    if (!user) {
      setErrors({ form: "Please sign in again." });
      return;
    }
    if (!selectedParty) {
      setErrors({ form: "Please select a party." });
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setErrors({});

    let uploadedPath: string | null = null;

    try {
      if (externalDoc) {
        const prepared = await maybeCompressImage(externalDoc);
        uploadedPath = await uploadChallan(prepared);
      }

      const created = await createTransaction({
        type: direction,
        materialId: component.id,
        companyId: selectedParty.id,
        pieces: Math.round(Number(quantity)),
        totalAmount: Number(totalAmount.replace(/,/g, "")) || 0,
        unitPrice: unitPrice.trim()
          ? Number(unitPrice.replace(/,/g, ""))
          : null,
        transactionDate: date,
        challanPath: uploadedPath ?? "",
        challanNumber: isReceive ? challanNumber.trim() : null,
        externalDocumentPath: uploadedPath,
        createdBy: user.id,
        partySnapshot: {
          name: selectedParty.name,
          company: selectedParty.name,
          location: selectedParty.location,
          post: selectedParty.post,
          contact: selectedParty.contact,
          pincode: selectedParty.pincode,
        },
      });

      setSaved(created as Tables<"transactions">);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({
        queryKey: ["component_parties", component.id],
      });

      setPartyId(null);
      setQuantity("");
      setUnitPrice("");
      setTotalAmount("");
      setDate(todayISO());
      setChallanNumber("");
      setExternalDoc(null);
    } catch (e) {
      if (uploadedPath) await removeChallan(uploadedPath);
      setErrors({
        form:
          e instanceof Error
            ? e.message
            : `Could not save the ${verb.toLowerCase()} record.`,
      });
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  // ----- success state -----
  if (saved) {
    return (
      <div className="mx-auto max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
        <div
          className={`mx-auto mb-3 flex size-12 items-center justify-center rounded-full ${
            isReceive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          <CheckIcon className="size-6" />
        </div>
        <p className="text-sm font-medium text-zinc-600">
          {isReceive ? "Received" : "Sent"} · {component.name}
        </p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">
          {saved.transaction_number}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {selectedParty?.name ?? "—"} ·{" "}
          {saved.transaction_date ? formatDate(saved.transaction_date) : ""} ·{" "}
          {formatINR(saved.total_amount)}
        </p>

        <div className="mt-6 grid gap-2">
          <Button variant="outline" onClick={() => router.push("/records")}>
            View record
          </Button>
          <Button
            onClick={() => {
              setSaved(null);
              setPartyId(null);
            }}
          >
            <RotateCcwIcon />
            Record another
          </Button>
        </div>
      </div>
    );
  }

  // ----- the one-screen form -----
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4">
        <p
          className={`text-xs font-semibold uppercase tracking-wide ${
            isReceive ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {isReceive ? "📥 Receive" : "📤 Send"}
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
          {verb} {component.name}
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Unit: {UNIT_LABELS[component.unit]}
          {component.category
            ? ` · ${CATEGORY_LABELS[component.category as ComponentCategory]}`
            : ""}
        </p>
      </div>

      <div className="grid gap-4">
        <Field label={isReceive ? "From Party" : "To Party"} error={errors.party}>
          <EntityCombobox
            items={parties.map(toPicker)}
            selectedId={partyId}
            placeholder="Select or add party"
            searchPlaceholder="Search party…"
            emptyText="No parties found."
            createLabel="Add party"
            canCreate={Boolean(canCreate)}
            onSelect={(i) => setPartyId(i.id)}
            onCreate={(name) => createParty.mutateAsync(name)}
          />
        </Field>

        {selectedParty && (
          <div className="rounded-lg border bg-muted/40 p-3 text-xs text-zinc-600">
            <p className="mb-1 font-medium text-zinc-800">Party details</p>
            <p>
              {selectedParty.name}
              {selectedParty.location ? ` · ${selectedParty.location}` : ""}
            </p>
            {selectedParty.post && <p>{selectedParty.post}</p>}
            {selectedParty.contact && <p>{selectedParty.contact}</p>}
            {selectedParty.pincode && <p>{selectedParty.pincode}</p>}
          </div>
        )}

        <Field label={`Quantity (${UNIT_LABELS[component.unit]})`} error={errors.quantity}>
          <Input
            inputMode="decimal"
            placeholder="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="h-11"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit Price (₹)" error={errors.unitPrice}>
            <InputGroup>
              <InputGroupAddon align="inline-start">₹</InputGroupAddon>
              <InputGroupInput
                inputMode="decimal"
                placeholder="0.00"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </InputGroup>
          </Field>

          <Field label="Total Amount (₹)" error={errors.totalAmount}>
            <InputGroup>
              <InputGroupAddon align="inline-start">₹</InputGroupAddon>
              <InputGroupInput
                inputMode="decimal"
                placeholder="0.00"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </InputGroup>
          </Field>
        </div>

        <Field label="Date" error={errors.date}>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11"
          />
        </Field>

        {isReceive && (
          <Field label="Source Challan No." error={errors.challanNumber}>
            <Input
              value={challanNumber}
              onChange={(e) => setChallanNumber(e.target.value)}
              placeholder="Challan number on the received document"
              className="h-11"
            />
          </Field>
        )}

        {isReceive && (
          <Field label="Source Document (optional)" error={errors.externalDoc}>
            <ChallanUploader file={externalDoc} onChange={setExternalDoc} />
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

      <div className="sticky bottom-0 -mx-4 mt-5 border-t bg-white/95 p-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="h-12 w-full text-base"
        >
          {saving ? "Saving…" : `Save ${verb}`}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
