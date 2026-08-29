"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { createTransaction } from "@/lib/transactions/createTransaction";
import { uploadChallan, removeChallan } from "@/lib/supabase/storage";
import { maybeCompressImage } from "@/lib/image";
import { formatDate, formatINR, formatPieces } from "@/lib/format";
import type { Enums, Tables } from "@/lib/supabase/database.types";

type Material = Tables<"materials">;
type Company = Tables<"companies">;
type Transaction = Tables<"transactions">;
type Direction = Extract<Enums<"transaction_type">, "received" | "given">;

const toPicker = (m: { id: string; name: string }): PickerItem => ({
  id: m.id,
  name: m.name,
});

function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

const DIRECTION_UI: Record<
  Direction,
  {
    verb: string;
    pastLabel: string;
    header: string;
    accent: string;
    accentText: string;
    saveLabel: string;
    anotherLabel: string;
    invalidPermission: string;
  }
> = {
  received: {
    verb: "Receive",
    pastLabel: "Received",
    header: "📥 Received",
    accent: "bg-emerald-100 text-emerald-700",
    accentText: "text-emerald-600",
    saveLabel: "Save Receipt",
    anotherLabel: "Receive another",
    invalidPermission: "You do not have permission to record receipts.",
  },
  given: {
    verb: "Give",
    pastLabel: "Given",
    header: "📤 Given",
    accent: "bg-amber-100 text-amber-700",
    accentText: "text-amber-600",
    saveLabel: "Save Issue",
    anotherLabel: "Give another",
    invalidPermission: "You do not have permission to record issues.",
  },
};

export function TransactionForm({ direction }: { direction: Direction }) {
  const router = useRouter();
  const { user, canCreate } = useAuth();
  const queryClient = useQueryClient();
  const ui = DIRECTION_UI[direction];

  const [materialId, setMaterialId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [pieces, setPieces] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [challan, setChallan] = useState<File | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Transaction | null>(null);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  // ----- data -----
  const { data: materials = [] } = useQuery({
    queryKey: ["materials", "active"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Material[];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies", "active"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Company[];
    },
  });

  // ----- inline creation -----
  const createMaterial = useMutation({
    mutationFn: async (name: string): Promise<PickerItem> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("materials")
        .insert({ name })
        .select("*")
        .single();
      if (error) throw new Error("Could not add material.");
      return toPicker(data as Material);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["materials"] }),
  });

  const createCompany = useMutation({
    mutationFn: async (name: string): Promise<PickerItem> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("companies")
        .insert({ name })
        .select("*")
        .single();
      if (error) throw new Error("Could not add company.");
      return toPicker(data as Company);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["companies"] }),
  });

  // ----- validation -----
  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!materialId) next.material = "Select or add a material.";
    if (!companyId) next.company = "Select or add a company.";
    const p = Number(pieces);
    if (!pieces.trim() || !Number.isInteger(p) || p <= 0)
      next.pieces = "Enter a whole number of pieces above 0.";
    const a = Number(amount.replace(/,/g, ""));
    if (amount.trim() && (Number.isNaN(a) || a < 0))
      next.amount = "Enter a valid amount.";
    if (!date) next.date = "Enter a date.";
    if (!challan) next.challan = "Challan photo is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ----- save flow: validate -> upload -> create -> cleanup-on-fail -----
  async function handleSubmit() {
    if (!canCreate) {
      setErrors({ form: ui.invalidPermission });
      return;
    }
    if (submittingRef.current) return; // duplicate-submit guard
    if (!validate()) return;

    if (!user) {
      setErrors({ form: "Please sign in again." });
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setErrors({});

    let challanPath: string | null = null;

    try {
      // 1. Upload challan first
      const prepared = await maybeCompressImage(challan!);
      challanPath = await uploadChallan(prepared);

      // 2. Create the transaction with the storage path
      const created = await createTransaction({
        type: direction,
        materialId: materialId!,
        companyId: companyId!,
        pieces: Number(pieces),
        totalAmount: Number(amount.replace(/,/g, "")) || 0,
        transactionDate: date,
        challanPath,
        createdBy: user.id,
      });

      // Success — REC/GIV number came from the DB response, never built here.
      setSaved(created);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });

      // reset form for "another"
      setMaterialId(null);
      setCompanyId(null);
      setPieces("");
      setAmount("");
      setDate(todayISO());
      setChallan(null);
    } catch (e) {
      // If the transaction insert failed after a successful upload, attempt
      // best-effort orphan cleanup (distinct outcomes logged in storage.ts).
      if (challanPath) {
        await removeChallan(challanPath);
      }
      const message =
        e instanceof Error ? e.message : `Could not save the ${ui.pastLabel.toLowerCase()} record.`;
      // No success state is shown — never fake success.
      setSaved(null);
      setErrors({ form: message });
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
          className={`mx-auto mb-3 flex size-12 items-center justify-center rounded-full ${ui.accent}`}
        >
          <CheckIcon className="size-6" />
        </div>
        <p className="text-sm font-medium text-zinc-600">{ui.pastLabel}</p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">
          {saved.transaction_number}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatPieces(saved.pieces)} · {saved.transaction_date ? formatDate(saved.transaction_date) : ""} ·{" "}
          {formatINR(saved.total_amount)}
        </p>

        <div className="mt-6 grid gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard")}
          >
            View record
          </Button>
          <Button
            onClick={() => {
              setSaved(null);
            }}
          >
            <RotateCcwIcon />
            {ui.anotherLabel}
          </Button>
        </div>
      </div>
    );
  }

  // ----- the one-screen form -----
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4">
        <p className={`text-xs font-semibold uppercase tracking-wide ${ui.accentText}`}>
          {ui.header}
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
          {ui.verb} Material
        </h1>
      </div>

      <div className="grid gap-4">
        {/* Material */}
        <Field label="Material" error={errors.material}>
          <EntityCombobox
            items={materials.map(toPicker)}
            selectedId={materialId}
            placeholder="Select or add material"
            searchPlaceholder="Search material…"
            emptyText="No materials found."
            createLabel="Add material"
            canCreate={Boolean(canCreate)}
            onSelect={(i) => setMaterialId(i.id)}
            onCreate={(name) => createMaterial.mutateAsync(name)}
          />
        </Field>

        {/* From/To company */}
        <Field
          label={direction === "received" ? "From" : "To"}
          error={errors.company}
        >
          <EntityCombobox
            items={companies.map(toPicker)}
            selectedId={companyId}
            placeholder="Select or add company"
            searchPlaceholder="Search company…"
            emptyText="No companies found."
            createLabel="Add company"
            canCreate={Boolean(canCreate)}
            onSelect={(i) => setCompanyId(i.id)}
            onCreate={(name) => createCompany.mutateAsync(name)}
          />
        </Field>

        {/* Pieces */}
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

        {/* Amount */}
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

        {/* Date */}
        <Field label="Date" error={errors.date}>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11"
          />
        </Field>

        {/* Challan */}
        <Field label="Challan" error={errors.challan}>
          <ChallanUploader file={challan} onChange={setChallan} />
        </Field>

        {errors.form ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
          >
            {errors.form}
          </p>
        ) : null}
      </div>

      {/* Sticky save action */}
      <div className="sticky bottom-0 -mx-4 mt-5 border-t bg-white/95 p-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="h-12 w-full text-base"
        >
          {saving ? "Saving…" : ui.saveLabel}
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
  children: ReactNode;
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
