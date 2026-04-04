"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CountdownBadge } from "@/components/countdown-badge";
import { PlayerBox } from "@/components/player-box";
import { StageMetaBar } from "@/components/games/whosdoneit/room/stage-meta-bar";
import { StageFooter } from "@/components/stage-footer";
import { StageShell } from "@/components/stage-shell";
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
    <StageShell>
      <StageMetaBar
        deadlineAt={null}
        trackingItems={[
          { label: "Submitted", value: `${submittedPlayerCount}/${totalPlayerCount}` },
        ]}
        title="Accusations"
      />
      <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-6 overflow-y-auto overflow-x-hidden pr-1">
        <div className="flex flex-col items-center gap-1">
          <p className="px-4 text-center text-xl font-black text-slate-900 sm:text-2xl">
            {prompt}
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="text-center text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 sm:text-base">
            Select the players you think are guilty
          </p>
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
      </div>
      <StageFooter>
        <button
          className="grid w-full grid-cols-[4.75rem_1fr_4.75rem] items-stretch overflow-hidden rounded-2xl bg-black text-xl font-bold text-white disabled:opacity-60"
          disabled={busy}
          onClick={() => void onSubmit(selectedTargetIds)}
          type="button"
        >
          <span aria-hidden="true" />
          <span className="flex items-center justify-center px-4 py-3 text-center">
            {busy ? "..." : "Submit"}
          </span>
          {!busy ? (
            <CountdownBadge deadlineAt={deadlineAt} variant="button-dark" />
          ) : (
            <span aria-hidden="true" className="border-l border-white/20" />
          )}
        </button>
      </StageFooter>
    </StageShell>
  );
}
