"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PlayerBox } from "@/components/player-box";
import { StageMetaBar } from "@/components/games/whosdoneit/room/stage-meta-bar";
import type { Player } from "@/types/whosdoneit";

type GuessingStageProps = {
  prompt: string;
  targets: Player[];
  myGuesses: Map<string, boolean>;
  submittedPlayerCount: number;
  totalPlayerCount: number;
  deadlineAt: string | null;
  busy: boolean;
  onSubmit: (selectedTargetIds: string[]) => Promise<void>;
};

export function GuessingStage({
  prompt,
  targets,
  myGuesses,
  submittedPlayerCount,
  totalPlayerCount,
  deadlineAt,
  busy,
  onSubmit,
}: GuessingStageProps) {
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>(() =>
    targets
      .filter((target) => myGuesses.get(target.id) === true)
      .map((target) => target.id),
  );
  const autoSubmittedRef = useRef(false);

  const selectedSet = useMemo(
    () => new Set(selectedTargetIds),
    [selectedTargetIds],
  );

  useEffect(() => {
    autoSubmittedRef.current = false;
  }, [deadlineAt]);

  useEffect(() => {
    if (!deadlineAt || autoSubmittedRef.current) {
      return;
    }

    const triggerAutoSubmit = () => {
      if (autoSubmittedRef.current || busy) {
        return;
      }

      autoSubmittedRef.current = true;
      void onSubmit(selectedTargetIds);
    };

    const remainingMs = new Date(deadlineAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      triggerAutoSubmit();
      return;
    }

    const timeout = window.setTimeout(triggerAutoSubmit, remainingMs + 50);
    return () => window.clearTimeout(timeout);
  }, [busy, deadlineAt, onSubmit, selectedTargetIds]);

  return (
    <section className="card-enter -mx-[var(--card-padding)] flex min-h-0 min-w-0 flex-1 flex-col px-[var(--card-padding)] pb-5 pt-2">
      <StageMetaBar
        deadlineAt={deadlineAt}
        submittedCount={submittedPlayerCount}
        title="Accusations"
        totalCount={totalPlayerCount}
      />
      <p className="mt-3 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-xl font-black text-slate-900 sm:text-2xl">
        {prompt}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Who&apos;s Done It?
      </p>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <ul className="flex min-w-0 flex-wrap justify-center gap-3">
          {targets.map((target) => {
            const selected = selectedSet.has(target.id);
            return (
              <li className="flex max-w-full items-center justify-center" key={target.id}>
                <button
                  className="rounded-2xl p-0.5 transition disabled:opacity-60"
                  disabled={busy}
                  onClick={() =>
                    setSelectedTargetIds((current) =>
                      current.includes(target.id)
                        ? current.filter((id) => id !== target.id)
                        : [...current, target.id],
                    )
                  }
                  type="button"
                >
                  <PlayerBox
                    className={selected ? "player-box-selected-guilty" : ""}
                    color={target.color}
                    emoji={target.emoji}
                    name={target.name}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-3 shrink-0 border-t border-slate-200 pt-3">
        <button
          className="w-full rounded-2xl bg-black px-4 py-3 text-xl font-bold text-white disabled:opacity-60"
          disabled={busy}
          onClick={() => void onSubmit(selectedTargetIds)}
          type="button"
        >
          {busy ? "..." : "Submit"}
        </button>
      </div>
    </section>
  );
}
