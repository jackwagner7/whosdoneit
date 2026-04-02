"use client";

import { useEffect, useState } from "react";

type CountdownBadgeProps = {
  deadlineAt: string | null;
  paused?: boolean;
  pausedRemainingSeconds?: number | null;
  onClick?: (() => void) | undefined;
  variant?: "default" | "button-dark" | "footer-light" | "segmented";
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
  variant = "default",
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

  if (variant === "button-dark") {
    return (
      <div
        className={`flex h-full w-[4.75rem] items-center justify-center border-l px-3 text-base font-bold tabular-nums ${
          paused
            ? "border-amber-200/50 text-amber-100"
            : "border-white/20 text-white"
        }`}
      >
        <span className={isUrgent ? "text-rose-400" : ""}>{remaining}</span>
      </div>
    );
  }

  if (variant === "footer-light") {
    return (
      <div className="flex h-full w-[4.75rem] items-center justify-center border-l border-slate-200 px-3 text-base font-bold tabular-nums text-slate-700">
        <span className={isUrgent ? "text-rose-600" : ""}>{remaining}</span>
      </div>
    );
  }

  if (variant === "segmented") {
    const className =
      `flex h-full min-w-[4.75rem] items-center justify-center bg-slate-50 px-3 text-xl font-bold tabular-nums text-slate-900 ${
        paused ? "text-amber-900" : ""
      } ${onClick ? "cursor-pointer" : ""}`;

    if (onClick) {
      return (
        <button className={className} onClick={onClick} type="button">
          <span className={isUrgent ? "text-rose-700" : ""}>{remaining}</span>
        </button>
      );
    }

    return (
      <div className={className}>
        <span className={isUrgent ? "text-rose-700" : ""}>{remaining}</span>
      </div>
    );
  }

  const className =
    `inline-flex min-w-[3.5rem] items-center justify-center rounded-full px-3 py-1.5 text-lg font-bold tabular-nums ${
      paused
        ? "bg-amber-100 text-amber-900"
        : "bg-slate-100 text-slate-950"
    } ${onClick ? "cursor-pointer" : ""}`;

  if (onClick) {
    return (
      <button className={className} onClick={onClick} type="button">
        <span className={isUrgent ? "text-rose-700" : ""}>{remaining}</span>
      </button>
    );
  }

  return (
    <div className={className}>
      <span className={isUrgent ? "text-rose-700" : ""}>{remaining}</span>
    </div>
  );
}
