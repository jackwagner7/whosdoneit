"use client";

export type TrackingStatItem = {
  label: string;
  value: string;
};

type TrackingStatProps = {
  item: TrackingStatItem;
  isLast?: boolean;
};

export function TrackingStat({ item, isLast = false }: TrackingStatProps) {
  return (
    <div className="table-row text-right">
      <p
        className={`table-cell bg-slate-50/75 px-3 py-1.5 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-slate-500 ${
          isLast ? "" : "border-b border-slate-200/80"
        }`.trim()}
      >
        {item.label}
      </p>
      <div
        className={`table-cell min-w-[3.5rem] border-l border-slate-300/80 bg-slate-100/70 px-3 py-1.5 text-center text-[0.78rem] font-black tracking-[0.18em] whitespace-nowrap tabular-nums text-slate-700 ${
          isLast ? "" : "border-b border-slate-200/80"
        }`.trim()}
      >
        {item.value}
      </div>
    </div>
  );
}
