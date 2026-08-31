import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Component } from "@/lib/supabase/types";
import { useActiveComponents } from "@/hooks/useMasters";
import { useTransactions, type TransactionWithNames } from "@/hooks/useTransactions";

export type PeriodKey = "today" | "week" | "month" | "custom";

export type PeriodRange = {
  start: string; // inclusive YYYY-MM-DD
  end: string; // inclusive YYYY-MM-DD
};

export function todayISO(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

export function startOfWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? 6 : day - 1; // Monday start
  d.setDate(d.getDate() - diff);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + "01";
}

export function rangeForPeriod(period: PeriodKey, custom?: PeriodRange): PeriodRange {
  const today = todayISO();
  switch (period) {
    case "today":
      return { start: today, end: today };
    case "week":
      return { start: startOfWeek(today), end: today };
    case "month":
      return { start: startOfMonth(today), end: today };
    case "custom":
      return custom ?? { start: today, end: today };
  }
}

export function inRange(tx: TransactionWithNames, range: PeriodRange): boolean {
  return tx.transaction_date >= range.start && tx.transaction_date <= range.end;
}

export type Kpis = {
  receivedPieces: number;
  receivedValue: number;
  sentPieces: number;
  sentValue: number;
  txCount: number;
  netPieces: number;
  netValue: number;
};

export function summarizeKpis(txs: TransactionWithNames[]): Kpis {
  const k: Kpis = { receivedPieces: 0, receivedValue: 0, sentPieces: 0, sentValue: 0, txCount: 0, netPieces: 0, netValue: 0 };
  for (const t of txs) {
    k.txCount += 1;
    if (t.type === "received") {
      k.receivedPieces += t.pieces;
      k.receivedValue += t.total_amount ?? t.unit_price ?? 0;
    } else {
      k.sentPieces += t.pieces;
      k.sentValue += t.total_amount ?? 0;
    }
  }
  k.netPieces = k.receivedPieces - k.sentPieces;
  k.netValue = k.receivedValue - k.sentValue;
  return k;
}

export type MovementRow = {
  componentId: string;
  name: string;
  received: number;
  sent: number;
  net: number;
};

export function summarizeMovementByComponent(txs: TransactionWithNames[]): MovementRow[] {
  const map = new Map<string, MovementRow>();
  for (const t of txs) {
    let row = map.get(t.material_id);
    if (!row) {
      row = { componentId: t.material_id, name: t.material_name, received: 0, sent: 0, net: 0 };
      map.set(t.material_id, row);
    }
    if (t.type === "received") row.received += t.pieces;
    else row.sent += t.pieces;
    row.net = row.received - row.sent;
  }
  return [...map.values()].sort((a, b) => b.net - a.net);
}

export type SpendRow = {
  componentId: string;
  name: string;
  qtyRec: number;
  spend: number;
  avgRate: number;
};

export function summarizeSpend(txs: TransactionWithNames[]): SpendRow[] {
  const map = new Map<string, { name: string; qty: number; spend: number }>();
  for (const t of txs) {
    if (t.type !== "received") continue;
    const cur = map.get(t.material_id) ?? { name: t.material_name, qty: 0, spend: 0 };
    cur.qty += t.pieces;
    cur.spend += t.total_amount ?? (t.unit_price ?? 0) * t.pieces;
    map.set(t.material_id, cur);
  }
  return [...map.values()]
    .map((r) => ({ componentId: "", name: r.name, qtyRec: r.qty, spend: r.spend, avgRate: r.qty ? r.spend / r.qty : 0 }))
    .sort((a, b) => b.spend - a.spend);
}

export type ActivityMetric = "pieces" | "value" | "txns";

export type ActivityPoint = {
  date: string;
  label: string;
  pieces: number;
  value: number;
  txns: number;
};

export function buildActivitySeries(
  range: PeriodRange,
  txs: TransactionWithNames[],
  buckets: number
): ActivityPoint[] {
  const start = new Date(range.start + "T00:00:00");
  const end = new Date(range.end + "T00:00:00");
  const daySpan = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const step = Math.max(1, Math.ceil(daySpan / buckets));

  const points: ActivityPoint[] = [];
  const now = new Date(start);
  while (now <= end) {
    const date = now.toISOString().slice(0, 10);
    points.push({ date, label: dayLabel(date), pieces: 0, value: 0, txns: 0 });
    now.setDate(now.getDate() + step);
  }
  if (points[points.length - 1].date < range.end) {
    points.push({ date: range.end, label: dayLabel(range.end), pieces: 0, value: 0, txns: 0 });
  }

  const byDate = new Map<string, ActivityPoint>();
  for (const p of points) byDate.set(p.date, p);
  for (const t of txs) {
    const p = byDate.get(t.transaction_date);
    if (!p) continue;
    p.txns += 1;
    if (t.type === "received") p.pieces += t.pieces;
    else p.pieces += t.pieces; // movement magnitude for the chart
    p.value += t.total_amount ?? 0;
  }
  return points;
}

function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export type NeedsAttentionIssue = {
  id: string;
  kind: "price" | "qty" | "duplicate";
  title: string;
  detail: string;
};

export function deriveNeedsAttention(allTxs: TransactionWithNames[]): NeedsAttentionIssue[] {
  const issues: NeedsAttentionIssue[] = [];
  const monthStart = startOfMonth(todayISO());
  const inMonth = allTxs.filter((t) => t.transaction_date >= monthStart);
  const lastMonthStart = addDays(monthStart, -30);

  // Price change: avg rate moved >15% vs prior 30-day window, per component.
  const rateByComp = (list: TransactionWithNames[]) => {
    const map = new Map<string, { qty: number; spend: number }>();
    for (const t of list) {
      if (t.type !== "received") continue;
      const cur = map.get(t.material_name) ?? { qty: 0, spend: 0 };
      cur.qty += t.pieces;
      cur.spend += t.total_amount ?? (t.unit_price ?? 0) * t.pieces;
      map.set(t.material_name, cur);
    }
    return [...map.values()].map((r) => (r.qty ? r.spend / r.qty : 0)).filter((r) => r > 0);
  };
  const current = inMonth;
  const prior = allTxs.filter((t) => t.transaction_date >= lastMonthStart && t.transaction_date < monthStart);
  const curRates = rateByComp(current);
  const priorRates = rateByComp(prior);
  if (curRates.length && priorRates.length) {
    const maxDelta = Math.max(
      ...curRates.map((c) => {
        const avgPrior = priorRates[priorRates.length - 1] || c;
        return Math.abs((c - avgPrior) / avgPrior);
      })
    );
    if (maxDelta > 0.15) {
      issues.push({ id: "price", kind: "price", title: "Price Change", detail: "A component's avg rate moved more than 15% this period." });
    }
  }

  // Unusual qty: any component received more than ~1.5x its own rolling average.
  const recTxs = allTxs.filter((t) => t.type === "received");
  const byComp = new Map<string, TransactionWithNames[]>();
  for (const t of recTxs) byComp.set(t.material_name, [...(byComp.get(t.material_name) ?? []), t]);
  for (const [name, list] of byComp) {
    if (list.length < 2) continue;
    const total = list.reduce((s, t) => s + t.pieces, 0);
    const avg = total / list.length;
    const last = list[list.length - 1].pieces;
    if (last > avg * 1.5 && avg > 0) {
      issues.push({ id: `qty-${name}`, kind: "qty", title: "Unusual Qty", detail: `${name} received above its monthly average.` });
    }
  }

  // Duplicate transaction numbers.
  const seen = new Map<string, number>();
  for (const t of allTxs) seen.set(t.transaction_number, (seen.get(t.transaction_number) ?? 0) + 1);
  for (const [num, count] of seen) {
    if (count > 1) {
      issues.push({ id: `dup-${num}`, kind: "duplicate", title: "Duplicate?", detail: `${num} appears ${count} times in the ledger.` });
    }
  }

  return issues.slice(0, 3);
}

export type ComponentPreview = Component & { partyCount: number };

export function useComponentPartyCounts(): Map<string, number> {
  const { data } = useQuery({
    queryKey: ["component_parties", "counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("component_parties")
        .select("component_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) counts[row.component_id] = (counts[row.component_id] ?? 0) + 1;
      return counts;
    },
  });
  return useMemo(() => new Map(Object.entries(data ?? {})), [data]);
}

export type DashboardData = {
  isLoading: boolean;
  error: unknown;
  components: Component[];
  partyCounts: Map<string, number>;
  kpis: Kpis;
  movement: MovementRow[];
  spend: SpendRow[];
  activity: ActivityPoint[];
  recent: TransactionWithNames[];
  needsAttention: NeedsAttentionIssue[];
};

export function useDashboardData(period: PeriodKey, custom?: PeriodRange): DashboardData {
  const { data: txs = [], isLoading: txLoading, error } = useTransactions();
  const { items: components } = useActiveComponents();
  const partyCounts = useComponentPartyCounts();

  const range = useMemo(() => rangeForPeriod(period, custom), [period, custom]);
  const ranged = useMemo(() => txs.filter((t) => inRange(t, range)), [txs, range]);

  return useMemo(
    () => ({
      isLoading: txLoading,
      error,
      components,
      partyCounts,
      kpis: summarizeKpis(ranged),
      movement: summarizeMovementByComponent(ranged),
      spend: summarizeSpend(ranged),
      activity: buildActivitySeries(range, ranged, 7),
      recent: txs.slice(0, 6),
      needsAttention: deriveNeedsAttention(txs),
    }),
    [txLoading, error, components, partyCounts, ranged, txs, range]
  );
}
