"use client";

import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PlusIcon,
  PencilIcon,
  SearchIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { Enums, Tables } from "@/lib/supabase/database.types";

type Material = Tables<"materials">;
type Company = Tables<"companies">;
type Profile = Tables<"profiles">;
type Role = Enums<"app_role">;

type Tab = "materials" | "companies" | "users";

export function SettingsPage() {
  const { isAdmin, canManageMasters } = useAuth();
  const [tab, setTab] = useState<Tab>("materials");

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "materials", label: "Materials", show: canManageMasters },
    { key: "companies", label: "Companies", show: canManageMasters },
    { key: "users", label: "Users & Roles", show: isAdmin },
  ];

  const visibleTabs = tabs.filter((t) => t.show);
  const activeTab = visibleTabs.some((t) => t.key === tab)
    ? tab
    : visibleTabs[0]?.key ?? "materials";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage master data and users.
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

      {activeTab === "materials" && <MaterialsSection />}
      {activeTab === "companies" && <CompaniesSection />}
      {activeTab === "users" && <UsersSection />}

      {visibleTabs.length === 0 && (
        <p className="rounded-lg bg-muted p-6 text-center text-sm text-zinc-500">
          You do not have access to Settings.
        </p>
      )}
    </div>
  );
}

// ---------------- Materials ----------------

function MaterialsSection() {
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
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = items.filter((m) =>
    m.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setName("");
    setCode("");
    setErr(null);
  }
  function openEdit(m: Material) {
    setEditing(m);
    setCreating(false);
    setName(m.name);
    setCode(m.code ?? "");
    setErr(null);
  }

  async function save() {
    if (saving) return;
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const supabase = createClient();
      if (creating) {
        const { error } = await supabase
          .from("materials")
          .insert({ name: name.trim(), code: code.trim() || null });
        if (error) throw new Error("Could not add material.");
      } else if (editing) {
        const { error } = await supabase
          .from("materials")
          .update({ name: name.trim(), code: code.trim() || null })
          .eq("id", editing.id);
        if (error) throw new Error("Could not update material.");
      }
      inval();
      setCreating(false);
      setEditing(null);
      setName("");
      setCode("");
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

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search materials…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <Button onClick={openCreate}>
          <PlusIcon /> Add material
        </Button>
      </div>

      {/* create/edit form */}
      {(creating || editing) && (
        <div className="mb-4 rounded-xl border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {creating ? "Add material" : "Edit material"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. MS Bracket"
                className="h-10"
                autoFocus
              />
            </Field>
            <Field label="Code (optional)">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. MS-001"
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
          No materials found.
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
                {m.code && <p className="truncate text-xs text-zinc-500">{m.code}</p>}
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------- Companies ----------------

function CompaniesSection() {
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
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = items.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setName("");
    setErr(null);
  }
  function openEdit(c: Company) {
    setEditing(c);
    setCreating(false);
    setName(c.name);
    setErr(null);
  }

  async function save() {
    if (saving) return;
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const supabase = createClient();
      if (creating) {
        const { error } = await supabase
          .from("companies")
          .insert({ name: name.trim() });
        if (error) throw new Error("Could not add company.");
      } else if (editing) {
        const { error } = await supabase
          .from("companies")
          .update({ name: name.trim() })
          .eq("id", editing.id);
        if (error) throw new Error("Could not update company.");
      }
      inval();
      setCreating(false);
      setEditing(null);
      setName("");
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

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search companies…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <Button onClick={openCreate}>
          <PlusIcon /> Add company
        </Button>
      </div>

      {(creating || editing) && (
        <div className="mb-4 rounded-xl border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {creating ? "Add company" : "Edit company"}
          </h3>
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ABC Ltd"
              className="h-10"
              autoFocus
            />
          </Field>
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
          No companies found.
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
              <p className="truncate text-sm font-medium">{c.name}</p>
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
              </div>
            </li>
          ))}
        </ul>
      )}
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

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}
