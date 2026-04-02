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
  const hasRightColumn = hasTrackingItems || Boolean(description);
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
    <header
      className="relative -mt-2 -mx-[var(--card-padding)] shrink-0 px-[var(--card-padding)]"
      ref={headerRef}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="pt-2 flex shrink-0 flex-col items-start gap-2 text-left">
          <p className="stage-heading leading-none">{title}</p>
          {hasTimerSlot ? (
            <div className="relative flex min-h-9 items-center justify-start">
              {hasTimerDisplay ? (
                <>
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
                    <div className="absolute left-0 top-full z-10 mt-2 flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
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
                </>
              ) : (
                <div
                  aria-hidden="true"
                  className="invisible inline-flex min-w-[3.25rem] items-center justify-center gap-1 rounded-full px-3 py-1 text-sm font-bold"
                >
                  <span>000</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {hasRightColumn ? (
          <div
            className={`ml-auto min-w-0 flex flex-col items-end ${
              hasTrackingItems ? "-mr-[var(--card-padding)]" : ""
            }`}
          >
            {hasTrackingItems ? (
              <div className="overflow-hidden rounded-sm border border-slate-200/80">
                <div className="table w-fit">
                  {trackingItems.map((item, index) => (
                    <TrackingStat
                      isLast={index === trackingItems.length - 1}
                      item={item}
                      key={item.label}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {description ? (
              <p className={`stage-subheading text-right ${hasTrackingItems ? "mt-2" : "-mt-1"}`}>
                {description}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
