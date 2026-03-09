"use client";

import { useEffect, useState } from "react";

type CountdownBadgeProps = {
  deadlineAt: string | null;
};

function getRemainingSeconds(deadlineAt: string | null, now: number) {
  if (!deadlineAt) {
    return null;
  }

  const remaining = Math.ceil((new Date(deadlineAt).getTime() - now) / 1000);
  return Math.max(0, remaining);
}

export function CountdownBadge({ deadlineAt }: CountdownBadgeProps) {
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
      className={`inline-flex w-[4.5rem] justify-center rounded-full px-3 py-1 text-sm font-bold tabular-nums ${
        isUrgent
          ? "timer-urgent bg-rose-500 text-white"
          : "bg-black text-white"
      }`}
    >
      {remaining}
    </div>
  );
}
