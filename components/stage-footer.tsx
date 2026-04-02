"use client";

import type { ReactNode } from "react";

type StageFooterProps = {
  children: ReactNode;
  className?: string;
};

type StageFooterMessageProps = {
  children: ReactNode;
  className?: string;
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
}: StageFooterMessageProps) {
  return (
    <StageFooter>
      <p
        className={`stage-subheading flex min-h-[3.5rem] items-center justify-center text-center ${className}`.trim()}
      >
        {children}
      </p>
    </StageFooter>
  );
}
