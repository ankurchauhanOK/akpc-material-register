"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardData, todayISO, startOfWeek, type PeriodKey } from "@/components/dashboard/dashboard-data";
import { PeriodControl } from "@/components/dashboard/period-control";
import { CustomRange } from "@/components/dashboard/custom-range";
import { MasterComponents } from "@/components/dashboard/master-components";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { MovementTable } from "@/components/dashboard/movement-table";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { SpendTable } from "@/components/dashboard/spend-table";
import { RecentDocuments } from "@/components/dashboard/recent-documents";
import { NeedsAttention } from "@/components/dashboard/needs-attention";

function timeOfDayGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardPage() {
  const { profile, role, canCreate } = useAuth();
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [custom, setCustom] = useState({ start: startOfWeek(todayISO()), end: todayISO() });

  const data = useDashboardData(period, custom);

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="flex flex-col gap-4">
      {/* ── MOBILE LAYOUT (below lg) ────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:hidden">
        {/* Greeting */}
        <h1 className="text-[22px] leading-tight font-semibold text-foreground">
          {timeOfDayGreeting()}, {firstName}
        </h1>

        {/* Summary metrics strip */}
        <KpiCards kpis={data.kpis} />

        {/* Date filter */}
        <PeriodControl value={period} onChange={setPeriod} />
        {period === "custom" && (
          <CustomRange
            start={custom.start}
            end={custom.end}
            onChange={(s, e) => setCustom({ start: s, end: e })}
          />
        )}

        {/* Receive / Send */}
        {canCreate && (
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/components?action=receive"
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-akpc-receive px-4 text-[13px] font-semibold text-white transition-colors hover:brightness-110"
            >
              <ArrowDownLeftIcon className="size-4" /> Receive
            </Link>
            <Link
              href="/give"
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-akpc-send px-4 text-[13px] font-semibold text-white transition-colors hover:brightness-110"
            >
              <ArrowUpRightIcon className="size-4" /> Send
            </Link>
          </div>
        )}

        {/* Master Components */}
        <MasterComponents
          components={data.components}
          partyCounts={data.partyCounts}
        />

        {/* Recent Activity */}
        <RecentDocuments rows={data.recent} />
      </div>

      {/* ── DESKTOP LAYOUT (lg and above) ───────────────────────── */}
      <div className="hidden flex-col gap-4 lg:flex">
        {/* Greeting + actions + period */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-muted-foreground">
              {role ? role[0].toUpperCase() + role.slice(1) : ""} ·
            </p>
            <h1 className="text-[32px] leading-tight font-semibold tracking-tight text-foreground">
              {timeOfDayGreeting()}, {firstName}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Material &amp; operations overview
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {period === "custom" && (
              <CustomRange
                start={custom.start}
                end={custom.end}
                onChange={(s, e) => setCustom({ start: s, end: e })}
              />
            )}
            <PeriodControl value={period} onChange={setPeriod} />
            {canCreate && (
              <div className="flex gap-2">
                <Link
                  href="/components?action=receive"
                  className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-emerald-700 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-800"
                >
                  <ArrowDownLeftIcon className="size-4" /> Receive
                </Link>
                <Link
                  href="/give"
                  className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-orange-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-orange-700"
                >
                  <ArrowUpRightIcon className="size-4" /> Send
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Master Components */}
        <MasterComponents
          components={data.components}
          partyCounts={data.partyCounts}
        />

        {/* KPI row */}
        <KpiCards kpis={data.kpis} />

        {/* Primary analytical grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[11fr_9fr]">
          <MovementTable rows={data.movement} />
          <ActivityChart points={data.activity} />
        </div>

        {/* Secondary grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SpendTable rows={data.spend} />
          <RecentDocuments rows={data.recent} />
        </div>

        {/* Needs Attention */}
        <NeedsAttention issues={data.needsAttention} />
      </div>
    </div>
  );
}
