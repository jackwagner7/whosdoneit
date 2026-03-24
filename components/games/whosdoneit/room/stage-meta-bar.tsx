"use client";

import { CountdownBadge } from "@/components/games/whosdoneit/room/countdown-badge";

type StageMetaBarProps = {
  title: string;
  submittedCount: number;
  totalCount: number;
  deadlineAt: string | null;
};

export function StageMetaBar({
  title,
  submittedCount,
  totalCount,
  deadlineAt,
}: StageMetaBarProps) {
  return (
    <header className="shrink-0 flex items-center justify-between gap-3">
      <p className="stage-heading">{title}</p>
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-slate-200 px-3 py-1 text-sm font-bold text-slate-700">
          {submittedCount}/{totalCount}
        </div>
        <CountdownBadge deadlineAt={deadlineAt} />
      </div>
    </header>
  );
}
