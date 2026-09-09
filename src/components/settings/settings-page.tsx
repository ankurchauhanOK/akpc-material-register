"use client";

import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, PencilIcon, SearchIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import {
  COMPONENT_CATEGORIES,
  PARTY_ROLES,
  UNIT_LABELS,
  UNIT_TYPES,
  CATEGORY_LABELS,
  ROLE_LABELS,
} from "@/lib/supabase/types";
import {
  deleteComponentPermanently,
  deleteCompanyPermanently,
  getComponentUsageBreakdown,
  getCompanyUsageBreakdown,
  type MasterUsageBreakdown,
} from "@/lib/masters/deleteMasters";
import { MasterDeleteDialog } from "@/components/settings/master-delete-dialog";

/** Human-readable disclosure of dependent records a cascade will remove. */
function cascadeNote(b: MasterUsageBreakdown | null): string | null {
  if (!b) return "Checking for associated records…";
  const total = b.documents + b.items + b.transactions;
  if (total === 0) return null;
  const parts: string[] = [];
  if (b.documents)
    parts.push(`${b.documents} document${b.documents === 1 ? "" : "s"}`);
  if (b.items)
    parts.push(`${b.items} line item${b.items === 1 ? "" : "s"}`);
  if (b.transactions)
    parts.push(`${b.transactions} transaction${b.transactions === 1 ? "" : "s"}`);
  let msg = `This will also permanently delete its ${parts.join(", ")}.`;
  if (b.ghostDocuments > 0)
    msg += ` Includes ${b.ghostDocuments} cancelled or archived record${b.ghostDocuments === 1 ? "" : "s"} not visible in the ledger.`;
  return msg;
}

type Material = Tables<"materials">;
type Company = Tables<"companies">;
type Profile = Tables<"profiles">;
type Role = Enums<"app_role">;
type UnitType = Enums<"unit_type">;
type ComponentCategory = Enums<"component_category">;
type PartyRole = Enums<"party_role">;

type Tab = "components" | "parties" | "users";

export function SettingsPage() {
  const { isAdmin, canManageMasters } = useAuth();
  const [tab, setTab] = useState<Tab>("components");

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "components", label: "Components", show: canManageMasters },
    { key: "parties", label: "Parties", show: canManageMasters },
    { key: "users", label: "Users & Roles", show: isAdmin },
  ];

  const visibleTabs = tabs.filter((t) => t.show);
  const activeTab = visibleTabs.some((t) => t.key === tab)
    ? tab
    : visibleTabs[0]?.key ?? "components";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage component masters and parties.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1 border-b">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              activeTab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-zinc-500 hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "components" && <ComponentsSection isAdmin={isAdmin} />}
      {activeTab === "parties" && <PartiesSection isAdmin={isAdmin} />}
      {activeTab === "users" && <UsersSection />}

      {visibleTabs.length === 0 && (
        <p className="rounded-lg bg-muted p-6 text-center text-sm text-zinc-500">
          You do not have access to Settings.
        </p>
      )}
    </div>
  );
}

// ---------------- Components (Component Master) ----------------

function ComponentsSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["materials"] });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["materials"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Material[];
    },
  });

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Material | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [deleteBreakdown, setDeleteBreakdown] =
    useState<MasterUsageBreakdown | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    unit: "pieces" as UnitType,
    category: "" as ComponentCategory | "",
    partCode: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = items.filter((m) =>
    m.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setForm({ name: "", unit: "pieces", category: "", partCode: "" });
    setErr(null);
  }
  function openEdit(m: Material) {
    setEditing(m);
    setCreating(false);
    setForm({
      name: m.name,
      unit: m.unit,
      category: m.category ?? "",
      partCode: m.part_code ?? "",
    });
    setErr(null);
  }

  async function save() {
    if (saving) return;
    if (!form.name.trim()) {
      setErr("Component name is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const supabase = createClient();
      const payload = {
        name: form.name.trim(),
        unit: form.unit,
        category: form.category ? (form.category as ComponentCategory) : null,
        part_code: form.partCode.trim() || null,
      };
      if (creating) {
        const { error } = await supabase.from("materials").insert(payload);
        if (error) throw new Error("Could not add component.");
      } else if (editing) {
        const { error } = await supabase
          .from("materials")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw new Error("Could not update component.");
      }
      inval();
      setCreating(false);
      setEditing(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(m: Material) {
    const supabase = createClient();
    await supabase
      .from("materials")
      .update({ is_active: !m.is_active })
      .eq("id", m.id);
    inval();
  }

  async function openDelete(m: Material) {
    setDeleteTarget(m);
    setDeleteBreakdown(null);
    try {
      setDeleteBreakdown(await getComponentUsageBreakdown(m.id));
    } catch {
      setDeleteBreakdown({
        documents: 0,
        items: 0,
        transactions: 0,
        ghostDocuments: 0,
      });
    }
  }

  async function performDelete() {
    if (!isAdmin || deleting || !deleteTarget) return;
    setDeleting(true);
    try {
      await deleteComponentPermanently(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteBreakdown(null);
      inval();
      toast.success("Component deleted permanently.");
    } catch {
      toast.error("Could not delete this component. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search components…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <Button onClick={openCreate}>
          <PlusIcon /> Add component
        </Button>
      </div>

      {(creating || editing) && (
        <div className="mb-4 rounded-xl border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {creating ? "Add component" : "Edit component"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Component Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Magnetic Bolt"
                className="h-10"
                autoFocus
              />
            </Field>
            <Field label="Unit">
              <Select
                value={form.unit}
                onValueChange={(v) => setForm({ ...form, unit: v as UnitType })}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map((u) => (
                    <SelectItem key={u} value={u}>
                      {UNIT_LABELS[u]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Category">
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm({ ...form, category: v as ComponentCategory | "" })
                }
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Pending" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">
                    <span className="text-zinc-400">Pending</span>
                  </SelectItem>
                  {COMPONENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Part Code">
              <Input
                value={form.partCode}
                onChange={(e) => setForm({ ...form, partCode: e.target.value })}
                placeholder="Optional"
                className="h-10"
              />
            </Field>
          </div>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
          <div className="mt-3 flex gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="p-6 text-center text-sm text-zinc-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-sm text-zinc-400">
          No components found.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-white">
          {filtered.map((m) => (
            <li
              key={m.id}
              className={cn(
                "flex items-center justify-between gap-3 px-4 py-3",
                !m.is_active && "opacity-50"
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="truncate text-xs text-zinc-500">
                  {UNIT_LABELS[m.unit]}
                  {m.category ? ` · ${CATEGORY_LABELS[m.category]}` : " · Pending"}
                  {m.part_code ? ` · ${m.part_code}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleActive(m)}
                >
                  {m.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(m)}>
                  <PencilIcon /> <span className="sr-only">Edit</span>
                </Button>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => openDelete(m)}
                  >
                    <TrashIcon /> <span className="sr-only">Delete</span>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <MasterDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
        title="Delete this component permanently?"
        description="This will permanently remove this component master record and cannot be undone."
        loading={deleting}
        onConfirm={performDelete}
        cascadeNote={cascadeNote(deleteBreakdown)}
        rows={
          deleteTarget
            ? [
                { label: "Component", value: deleteTarget.name },
                { label: "Unit", value: UNIT_LABELS[deleteTarget.unit] },
                {
                  label: "Category",
                  value: deleteTarget.category
                    ? CATEGORY_LABELS[deleteTarget.category]
                    : "Pending",
                },
                {
                  label: "Part code",
                  value: deleteTarget.part_code ?? "—",
                },
              ]
            : []
        }
      />
    </div>
  );
}

// ---------------- Parties (Party Master) ----------------

function PartiesSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["companies"] });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Company[];
    },
  });

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Company | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [deleteBreakdown, setDeleteBreakdown] =
    useState<MasterUsageBreakdown | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    location: "",
    post: "",
    contact: "",
    pincode: "",
    role: "" as PartyRole | "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = items.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setForm({
      name: "",
      location: "",
      post: "",
      contact: "",
      pincode: "",
      role: "",
    });
    setErr(null);
  }
  function openEdit(c: Company) {
    setEditing(c);
    setCreating(false);
    setForm({
      name: c.name,
      location: c.location ?? "",
      post: c.post ?? "",
      contact: c.contact ?? "",
      pincode: c.pincode ?? "",
      role: c.role ?? "",
    });
    setErr(null);
  }

  async function save() {
    if (saving) return;
    if (!form.name.trim()) {
      setErr("Party name is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const supabase = createClient();
      const payload = {
        name: form.name.trim(),
        location: form.location.trim() || null,
        post: form.post.trim() || null,
        contact: form.contact.trim() || null,
        pincode: form.pincode.trim() || null,
        role: form.role ? (form.role as PartyRole) : null,
      };
      if (creating) {
        const { error } = await supabase.from("companies").insert(payload);
        if (error) throw new Error("Could not add party.");
      } else if (editing) {
        const { error } = await supabase
          .from("companies")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw new Error("Could not update party.");
      }
      inval();
      setCreating(false);
      setEditing(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: Company) {
    const supabase = createClient();
    await supabase
      .from("companies")
      .update({ is_active: !c.is_active })
      .eq("id", c.id);
    inval();
  }

  async function openDelete(c: Company) {
    setDeleteTarget(c);
    setDeleteBreakdown(null);
    try {
      setDeleteBreakdown(await getCompanyUsageBreakdown(c.id));
    } catch {
      setDeleteBreakdown({
        documents: 0,
        items: 0,
        transactions: 0,
        ghostDocuments: 0,
      });
    }
  }

  async function performDelete() {
    if (!isAdmin || deleting || !deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCompanyPermanently(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteBreakdown(null);
      inval();
      toast.success("Company deleted permanently.");
    } catch {
      toast.error("Could not delete this company. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search parties…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <Button onClick={openCreate}>
          <PlusIcon /> Add party
        </Button>
      </div>

      {(creating || editing) && (
        <div className="mb-4 rounded-xl border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {creating ? "Add party" : "Edit party"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Rahul Sharma"
                className="h-10"
                autoFocus
              />
            </Field>
            <Field label="Role">
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as PartyRole | "" })}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Unclassified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">
                    <span className="text-zinc-400">Unclassified</span>
                  </SelectItem>
                  {PARTY_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Location">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Rudrapur"
                className="h-10"
              />
            </Field>
            <Field label="Post / Designation">
              <Input
                value={form.post}
                onChange={(e) => setForm({ ...form, post: e.target.value })}
                placeholder="e.g. Purchase Manager"
                className="h-10"
              />
            </Field>
            <Field label="Contact Number">
              <Input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                placeholder="e.g. 98xxxxxxx"
                className="h-10"
              />
            </Field>
            <Field label="Pincode">
              <Input
                value={form.pincode}
                onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                placeholder="e.g. 263153"
                className="h-10"
              />
            </Field>
          </div>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
          <div className="mt-3 flex gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="p-6 text-center text-sm text-zinc-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-sm text-zinc-400">
          No parties found.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-white">
          {filtered.map((c) => (
            <li
              key={c.id}
              className={cn(
                "flex items-center justify-between gap-3 px-4 py-3",
                !c.is_active && "opacity-50"
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="truncate text-xs text-zinc-500">
                  {c.role ? ROLE_LABELS[c.role] : "Unclassified"}
                  {c.location ? ` · ${c.location}` : ""}
                  {c.contact ? ` · ${c.contact}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleActive(c)}
                >
                  {c.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(c)}>
                  <PencilIcon /> <span className="sr-only">Edit</span>
                </Button>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => openDelete(c)}
                  >
                    <TrashIcon /> <span className="sr-only">Delete</span>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <MasterDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
        title="Delete this company permanently?"
        description="This will permanently remove this company profile and cannot be undone."
        loading={deleting}
        onConfirm={performDelete}
        cascadeNote={cascadeNote(deleteBreakdown)}
        rows={
          deleteTarget
            ? [
                { label: "Name", value: deleteTarget.name },
                {
                  label: "Role",
                  value: deleteTarget.role
                    ? ROLE_LABELS[deleteTarget.role]
                    : "Unclassified",
                },
                { label: "Location", value: deleteTarget.location ?? "—" },
                { label: "Post / Designation", value: deleteTarget.post ?? "—" },
                { label: "Contact", value: deleteTarget.contact ?? "—" },
                { label: "Pincode", value: deleteTarget.pincode ?? "—" },
              ]
            : []
        }
      />
    </div>
  );
}

// ---------------- Users ----------------

const ROLES: Role[] = ["admin", "operator", "viewer"];

function UsersSection() {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["profiles"] });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  async function setRole(id: string, roleValue: Role) {
    const supabase = createClient();
    await supabase.from("profiles").update({ role: roleValue }).eq("id", id);
    inval();
  }

  async function toggleActive(u: Profile) {
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ is_active: !u.is_active })
      .eq("id", u.id);
    inval();
  }

  return (
    <div>
      <p className="mb-4 text-sm text-zinc-500">
        Change roles and activate/deactivate users. There is no public sign-up;
        users are created in Supabase Auth by an admin.
      </p>

      {isLoading ? (
        <p className="p-6 text-center text-sm text-zinc-500">Loading…</p>
      ) : users.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-sm text-zinc-400">
          No users found.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className={cn(!u.is_active && "opacity-50")}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{u.full_name}</p>
                    <p className="text-xs text-zinc-400">{u.id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={u.role}
                      onChange={(e) => setRole(u.id, e.target.value as Role)}
                      className="h-9 rounded-lg border bg-white px-2 text-sm"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r[0].toUpperCase() + r.slice(1)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive(u)}
                    >
                      {u.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}
