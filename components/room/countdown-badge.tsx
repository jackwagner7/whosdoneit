"use client";

import { useEffect, useState } from "react";

type CountdownBadgeProps = {
  deadlineAt: string | null;
  prefix: string;
};

function getRemainingSeconds(deadlineAt: string | null, now: number) {
  if (!deadlineAt) {
    return null;
  }

  const remaining = Math.ceil((new Date(deadlineAt).getTime() - now) / 1000);
  return Math.max(0, remaining);
}

export function CountdownBadge({ deadlineAt, prefix }: CountdownBadgeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 500);

    return () => window.clearInterval(interval);
  }, []);

  const remaining = getRemainingSeconds(deadlineAt, now);

  if (remaining === null) {
    return null;
  }

  const isUrgent = remaining <= 5;
  return (
    <div
      className={`rounded-full px-3 py-1 text-sm font-bold ${
        isUrgent
          ? "timer-urgent bg-rose-500 text-white"
          : "bg-slate-900 text-white"
      }`}
    >
      {prefix} {remaining}s
    </div>
  );
}
