"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { CountdownBadge } from "@/components/countdown-badge";
import { TrackingStat, type TrackingStatItem } from "@/components/tracking-stat";

type StageHeaderAction = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
};

type StageHeaderProps = {
  title: string;
  description?: string;
  trackingItems?: TrackingStatItem[];
  deadlineAt?: string | null;
  reserveTimerSpace?: boolean;
  timerPaused?: boolean;
  pausedRemainingSeconds?: number | null;
  timerActions?: StageHeaderAction[];
};

export function StageHeader({
  title,
  description,
  trackingItems = [],
  deadlineAt = null,
  reserveTimerSpace = false,
  timerPaused = false,
  pausedRemainingSeconds = null,
  timerActions = [],
}: StageHeaderProps) {
  const headerRef = useRef<HTMLElement | null>(null);
  const [timerMenuOpen, setTimerMenuOpen] = useState(false);
  const hasTrackingItems = trackingItems.length > 0;
  const hasTimerDisplay = Boolean(deadlineAt || typeof pausedRemainingSeconds === "number");
  const hasTimerSlot = hasTimerDisplay || reserveTimerSpace;
  const hasTimerActions = hasTimerDisplay && timerActions.length > 0;

  useEffect(() => {
    if (!timerMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setTimerMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [timerMenuOpen]);

  return (
    <header className="relative shrink-0" ref={headerRef}>
      {hasTimerDisplay ? (
        <div className="absolute right-0 top-0 z-10">
          <div className="relative flex justify-end">
            <CountdownBadge
              deadlineAt={deadlineAt}
              paused={timerPaused}
              pausedRemainingSeconds={pausedRemainingSeconds}
              onClick={
                hasTimerActions
                  ? () => {
                      setTimerMenuOpen((current) => !current);
                    }
                  : undefined
              }
            />
            {hasTimerActions && timerMenuOpen ? (
              <div className="absolute right-0 top-full mt-2 flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                {timerActions.map((action) => (
                  <button
                    aria-label={action.label}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-950 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-default disabled:opacity-40"
                    disabled={action.disabled}
                    key={action.label}
                    onClick={() => {
                      setTimerMenuOpen(false);
                      action.onSelect();
                    }}
                    type="button"
                  >
                    {action.icon ?? <span className="text-sm font-bold">{action.label}</span>}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={hasTimerSlot ? "pr-20" : ""}>
        <p className="stage-heading text-left leading-none">{title}</p>
        {hasTrackingItems ? (
          <div className="mt-1 flex flex-row-reverse items-start justify-start gap-3">
            {trackingItems.map((item) => (
              <TrackingStat item={item} key={item.label} />
            ))}
          </div>
        ) : null}
        {description ? (
          <p className={`stage-subheading text-right ${hasTrackingItems ? "mt-2" : "mt-0.5"}`}>
            {description}
          </p>
        ) : null}
      </div>
    </header>
  );
}
