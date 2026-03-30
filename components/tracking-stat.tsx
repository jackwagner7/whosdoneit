"use client";

export type TrackingStatItem = {
  label: string;
  value: string;
};

type TrackingStatProps = {
  item: TrackingStatItem;
};

export function TrackingStat({ item }: TrackingStatProps) {
  return (
    <div className="grid justify-items-center gap-1 text-center">
      <p className="text-[0.72rem] font-black uppercase tracking-[0.14em] text-slate-500">
        {item.label}
      </p>
      <div className="rounded-full bg-slate-200 px-3 py-1 text-sm font-bold text-slate-700">
        {item.value}
      </div>
    </div>
  );
}
