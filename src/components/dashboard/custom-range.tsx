"use client";

export function CustomRange({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (s: string, e: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={start}
        max={end}
        onChange={(e) => onChange(e.target.value, end)}
        className="h-9 rounded-lg border border-border bg-white px-2.5 text-[13px] text-foreground"
        aria-label="From date"
      />
      <span className="text-[12px] text-muted-foreground">→</span>
      <input
        type="date"
        value={end}
        min={start}
        onChange={(e) => onChange(start, e.target.value)}
        className="h-9 rounded-lg border border-border bg-white px-2.5 text-[13px] text-foreground"
        aria-label="To date"
      />
    </div>
  );
}
