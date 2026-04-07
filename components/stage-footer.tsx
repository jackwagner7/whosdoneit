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

type StageFooterButtonProps = {
  children: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  deadlineAt?: string | null;
  timerPaused?: boolean;
  pausedRemainingSeconds?: number | null;
  onClick: () => void;
};

export function StageFooter({ children, className = "" }: StageFooterProps) {
  return (
    <div
      className={`mt-auto -mx-[var(--card-padding)] -mb-[var(--card-padding)] shrink-0 border-t border-slate-200 bg-white px-[var(--card-padding)] py-3 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export function StageFooterButton({
  children,
  disabled = false,
  busy = false,
  className = "",
  deadlineAt = null,
  timerPaused = false,
  pausedRemainingSeconds = null,
  onClick,
}: StageFooterButtonProps) {
  const hasTimer = Boolean(deadlineAt || typeof pausedRemainingSeconds === "number");

  if (hasTimer) {
    return (
      <button
        className={`grid min-h-[3.5rem] w-full grid-cols-[4.75rem_1fr_4.75rem] items-stretch overflow-hidden rounded-2xl bg-black text-xl font-bold text-white disabled:opacity-60 ${className}`.trim()}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <span aria-hidden="true" />
        <span className="flex items-center justify-center px-4 text-center leading-none">
          {children}
        </span>
        {!busy ? (
          <CountdownBadge
            deadlineAt={deadlineAt}
            paused={timerPaused}
            pausedRemainingSeconds={pausedRemainingSeconds}
            variant="button-dark"
          />
        ) : (
          <span aria-hidden="true" className="border-l border-white/20" />
        )}
      </button>
    );
  }

  return (
    <button
      className={`grid min-h-[3.5rem] w-full place-items-center rounded-2xl bg-black px-4 text-xl font-bold text-white disabled:opacity-60 ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="block leading-none">{children}</span>
    </button>
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
