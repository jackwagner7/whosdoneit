"use client";

import type { ReactNode } from "react";

type StageShellProps = {
  children: ReactNode;
  className?: string;
};

export function StageShell({ children, className = "" }: StageShellProps) {
  return (
    <section
      className={`card-enter -mt-2 -mx-[var(--card-padding)] -mb-[var(--card-padding)] flex min-h-0 min-w-0 flex-1 flex-col px-[var(--card-padding)] pt-2 pb-[var(--card-padding)] ${className}`.trim()}
    >
      {children}
    </section>
  );
}
