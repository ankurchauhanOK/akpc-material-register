"use client";

import { formatINR } from "@/lib/format";
import type { Kpis } from "@/components/dashboard/dashboard-data";

function num(v: number): string {
  return new Intl.NumberFormat("en-IN").format(v);
}

export function KpiCards({ kpis }: { kpis: Kpis }) {
  return (
    <>
      {/* Mobile: compact horizontal strip */}
      <section className="rounded-2xl border border-border bg-white p-3 shadow-sm lg:hidden">
        <div className="flex items-center justify-between">
          <StripCol
            label="Received"
            value={num(kpis.receivedPieces)}
            accent="text-emerald-700"
          />
          <span className="h-10 w-px bg-border" />
          <StripCol
            label="Sent"
            value={num(kpis.sentPieces)}
            accent="text-orange-600"
          />
          <span className="h-10 w-px bg-border" />
          <StripCol
            label="Trans."
            value={num(kpis.txCount)}
            accent="text-foreground"
          />
          <span className="h-10 w-px bg-border" />
          <StripCol
            label="Net"
            value={`${kpis.netPieces >= 0 ? "+" : "−"}${num(Math.abs(kpis.netPieces))}`}
            accent={kpis.netPieces >= 0 ? "text-emerald-700" : "text-red-600"}
          />
        </div>
      </section>

      {/* Desktop: 2x2 card grid */}
      <div className="hidden grid-cols-2 gap-3 lg:grid lg:grid-cols-4">
        <Kpi
          label="Received"
          value={`${num(kpis.receivedPieces)} pcs`}
          sub={`${formatINR(kpis.receivedValue)} value`}
          accentText="text-emerald-700"
          accentBar="bg-emerald-600"
        />
        <Kpi
          label="Sent"
          value={`${num(kpis.sentPieces)} pcs`}
          sub={`${formatINR(kpis.sentValue)} value`}
          accentText="text-orange-700"
          accentBar="bg-orange-500"
        />
        <Kpi
          label="Transactions"
          value={num(kpis.txCount)}
          sub="This period"
          accentText="text-foreground"
          accentBar="bg-zinc-700"
        />
        <Kpi
          label="Net Movement"
          value={`${kpis.netPieces >= 0 ? "+" : "−"}${num(Math.abs(kpis.netPieces))} pcs`}
          sub="Inventory Change"
          accentText={kpis.netPieces >= 0 ? "text-emerald-700" : "text-red-600"}
          accentBar={kpis.netPieces >= 0 ? "bg-emerald-600" : "bg-red-500"}
        />
      </div>
    </>
  );
}

function StripCol({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center">
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className={`mt-1 text-[20px] leading-tight font-semibold ${accent}`}>
        {value}
      </span>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accentText,
  accentBar,
}: {
  label: string;
  value: string;
  sub: string;
  accentText: string;
  accentBar: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${accentBar}`} />
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
      </div>
      <p className={`mt-2 text-[24px] leading-none font-semibold tracking-tight ${accentText}`}>
        {value}
      </p>
      <p className="mt-1.5 text-[12px] text-muted-foreground">{sub}</p>
    </div>
  );
}
