"use client";

import { useEffect, useState } from "react";

type CountdownBadgeProps = {
  deadlineAt: string | null;
  paused?: boolean;
  pausedRemainingSeconds?: number | null;
  onClick?: (() => void) | undefined;
};

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l4 2" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
    </svg>
  );
}

function getRemainingSeconds(
  deadlineAt: string | null,
  now: number,
  pausedRemainingSeconds: number | null,
) {
  if (typeof pausedRemainingSeconds === "number") {
    return Math.max(0, Math.round(pausedRemainingSeconds));
  }

  if (!deadlineAt) {
    return null;
  }

  const remaining = Math.ceil((new Date(deadlineAt).getTime() - now) / 1000);
  return Math.max(0, remaining);
}

export function CountdownBadge({
  deadlineAt,
  paused = false,
  pausedRemainingSeconds = null,
  onClick,
}: CountdownBadgeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 500);

    return () => window.clearInterval(interval);
  }, []);

  const remaining = getRemainingSeconds(deadlineAt, now, pausedRemainingSeconds);

  if (remaining === null) {
    return null;
  }

  const isUrgent = !paused && remaining <= 5;
  const className = `inline-flex min-w-[3.25rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-sm font-bold tabular-nums ${
    paused
      ? "bg-amber-100 text-amber-900"
      : isUrgent
        ? "timer-urgent bg-rose-500 text-white"
        : "bg-slate-100 text-slate-950"
  } ${onClick ? "cursor-pointer" : ""}`;
  const icon = paused ? <PauseIcon /> : <ClockIcon />;

  if (onClick) {
    return (
      <button className={className} onClick={onClick} type="button">
        <span>{remaining}</span>
        {icon}
      </button>
    );
  }

  return (
    <div className={className}>
      <span>{remaining}</span>
      {icon}
    </div>
  );
}
