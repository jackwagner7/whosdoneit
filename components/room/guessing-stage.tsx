"use client";

import { useMemo, useState } from "react";
import { CountdownBadge } from "@/components/room/countdown-badge";
import type { Player } from "@/types/games";

type GuessingStageProps = {
  prompt: string;
  targets: Player[];
  myGuesses: Map<string, boolean>;
  guessCount: number;
  expectedGuesses: number;
  myGuessCount: number;
  expectedMyGuessCount: number;
  deadlineAt: string | null;
  busy: boolean;
  onSubmit: (selectedTargetIds: string[]) => Promise<void>;
};

export function GuessingStage({
  prompt,
  targets,
  myGuesses,
  guessCount,
  expectedGuesses,
  myGuessCount,
  expectedMyGuessCount,
  deadlineAt,
  busy,
  onSubmit,
}: GuessingStageProps) {
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>(() =>
    targets
      .filter((target) => myGuesses.get(target.id) === true)
      .map((target) => target.id),
  );

  const selectedSet = useMemo(
    () => new Set(selectedTargetIds),
    [selectedTargetIds],
  );

  return (
    <section className="card-enter rounded-3xl border border-slate-200 bg-white p-5 pb-28 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500"># Guilty</p>
        <CountdownBadge deadlineAt={deadlineAt} prefix="T" />
      </div>
      <p className="mt-3 rounded-2xl bg-violet-50 px-4 py-3 text-xl font-black text-violet-900 sm:text-2xl">
        {prompt}
      </p>
      <p className="mt-3 text-sm font-semibold text-slate-600">
        You {myGuessCount}/{expectedMyGuessCount} | All {guessCount}/{expectedGuesses}
      </p>
      <ul className="mt-4 grid gap-2">
        {targets.map((target) => {
          const selected = selectedSet.has(target.id);
          return (
            <li key={target.id}>
              <button
                className={`w-full rounded-2xl border px-3 py-3 text-left text-lg font-bold transition ${
                  selected
                    ? "border-rose-600 bg-rose-50"
                    : "border-slate-200 bg-white"
                }`}
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
                <span style={{ color: target.color }}>
                  {target.name} {target.emoji}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3">
        <button
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-xl font-bold text-white disabled:opacity-60"
          disabled={busy}
          onClick={() => void onSubmit(selectedTargetIds)}
          type="button"
        >
          {busy ? "..." : "Submit guesses"}
        </button>
      </div>
    </section>
  );
}
