"use client";

import type { ReactNode } from "react";
import { CountdownBadge } from "@/components/countdown-badge";

type StageFooterProps = {
  children: ReactNode;
  className?: string;
};

type StageFooterMessageProps = {
  children: ReactNode;
  className?: string;
  deadlineAt?: string | null;
  timerPaused?: boolean;
  pausedRemainingSeconds?: number | null;
};

export function StageFooter({ children, className = "" }: StageFooterProps) {
  return (
    <div className={`mt-auto shrink-0 border-t border-slate-200 pt-3 ${className}`.trim()}>
      {children}
    </div>
  );
}

export function StageFooterMessage({
  children,
  className = "",
  deadlineAt = null,
  timerPaused = false,
  pausedRemainingSeconds = null,
}: StageFooterMessageProps) {
  const hasTimer = Boolean(deadlineAt || typeof pausedRemainingSeconds === "number");

  return (
    <StageFooter>
      {hasTimer ? (
        <div className="grid w-full grid-cols-[4.75rem_1fr_4.75rem] items-stretch">
          <span aria-hidden="true" />
          <div
            className={`stage-subheading flex min-h-[3.5rem] flex-wrap items-center justify-center gap-2 px-2 text-center !text-lg sm:!text-xl ${className}`.trim()}
          >
            {children}
          </div>
          <CountdownBadge
            deadlineAt={deadlineAt}
            paused={timerPaused}
            pausedRemainingSeconds={pausedRemainingSeconds}
            variant="footer-light"
          />
        </div>
      ) : (
        <div
          className={`stage-subheading flex min-h-[3.5rem] flex-wrap items-center justify-center gap-2 text-center !text-lg sm:!text-xl ${className}`.trim()}
        >
          {children}
        </div>
      )}
    </StageFooter>
  );
}
