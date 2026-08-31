"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/format";
import type { ActivityMetric, ActivityPoint } from "@/components/dashboard/dashboard-data";

const METRICS: { key: ActivityMetric; label: string }[] = [
  { key: "pieces", label: "Pieces" },
  { key: "value", label: "₹ Value" },
  { key: "txns", label: "Txns" },
];

const W = 560;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 30, left: 48 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

function fmtNum(v: number): string {
  return new Intl.NumberFormat("en-IN").format(v);
}

export function ActivityChart({ points }: { points: ActivityPoint[] }) {
  const [metric, setMetric] = useState<ActivityMetric>("pieces");
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(() => {
    const values = points.map((p) => p[metric]);
    const top = Math.max(1, ...values);
    return Math.max(4, Math.ceil(top / 4) * 4);
  }, [points, metric]);

  const step = plotW / Math.max(points.length, 1);
  const barW = step * 0.5;

  const yTicks = 4;

  const active = hover !== null ? points[hover] : points[points.length - 1];
  const unitLabel = metric === "value" ? "₹" : metric === "txns" ? "Txns" : "Pcs";

  return (
    <div className="rounded-2xl border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-[15px] font-semibold text-foreground">Activity</h3>
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-zinc-50 p-0.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                metric === m.key
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-2 pb-3 pt-4">
        {points.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No activity in this period.
          </p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-auto w-full"
              role="img"
              aria-label={`Activity by ${metric}`}
            >
              {Array.from({ length: yTicks + 1 }).map((_, i) => {
                const v = (max / yTicks) * i;
                const y = PAD.top + plotH - (v / max) * plotH;
                return (
                  <g key={i}>
                    <line
                      x1={PAD.left}
                      y1={y}
                      x2={W - PAD.right}
                      y2={y}
                      stroke="#ededed"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize={10}
                      fill="#8a8a8a"
                    >
                      {fmtNum(v)}
                    </text>
                  </g>
                );
              })}

              {points.map((p, i) => {
                const x = PAD.left + i * step + (step - barW) / 2;
                const h = (p[metric] / max) * plotH;
                const isLast = i === points.length - 1;
                const isActive = hover === i;
                return (
                  <rect
                    key={p.date}
                    x={x}
                    y={PAD.top + plotH - h}
                    width={barW}
                    height={Math.max(h, 2)}
                    rx={3}
                    fill={isLast && hover === null ? "#047857" : isActive ? "#047857" : "#a7d7c5"}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    className="cursor-pointer transition-all"
                  />
                );
              })}

              {points.map((p, i) => (
                <text
                  key={p.date}
                  x={PAD.left + i * step + step / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#8a8a8a"
                >
                  {p.label}
                </text>
              ))}
            </svg>

            <div className="flex items-center justify-between px-3 pt-1 text-[13px]">
              <p className="font-medium text-foreground">{active.label}</p>
              <p className="font-semibold text-emerald-700">
                {metric === "value" ? formatINR(active[metric]) : `${fmtNum(active[metric])} ${unitLabel}`}
              </p>
            </div>

            <p className="px-3 pb-1 text-right text-[11px] text-muted-foreground">
              Unit: {unitLabel}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
