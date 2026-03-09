"use client";

import { PlayerBox } from "@/components/player-box";
import { CountdownBadge } from "@/components/room/countdown-badge";

type RevealGuessRow = {
  id: string;
  guesserName: string;
  guesserColor: string;
  guesserEmoji: string;
  guessedAnswer: boolean;
  correct: boolean;
};

type RevealingStageProps = {
  prompt: string;
  target: {
    name: string;
    color: string;
    emoji: string;
  };
  truthVisible: boolean;
  truth: boolean | undefined;
  guessRows: RevealGuessRow[];
  canControl: boolean;
  busy: boolean;
  deadlineAt: string | null;
  onReveal: () => Promise<void>;
  onNext: () => Promise<void>;
};

export function RevealingStage({
  prompt,
  target,
  truthVisible,
  truth,
  guessRows,
  canControl,
  busy,
  deadlineAt,
  onReveal,
  onNext,
}: RevealingStageProps) {
  const innocentRows = guessRows.filter((row) => row.guessedAnswer === false);
  const guiltyRows = guessRows.filter((row) => row.guessedAnswer === true);
  const truthToneClass =
    truthVisible && typeof truth === "boolean"
      ? truth
        ? "text-rose-700"
        : "text-sky-700"
      : "text-slate-700";
  const innocentPanelClass =
    truthVisible && truth === false
      ? "min-w-0 rounded-2xl border-2 border-sky-400 bg-sky-200 p-3"
      : "min-w-0 rounded-2xl border border-sky-200 bg-sky-100 p-3";
  const guiltyPanelClass =
    truthVisible && truth === true
      ? "min-w-0 rounded-2xl border-2 border-rose-400 bg-rose-200 p-3"
      : "min-w-0 rounded-2xl border border-rose-200 bg-rose-50 p-3";

  return (
    <section className="card-enter -mx-[var(--card-padding)] flex min-h-0 min-w-0 flex-1 flex-col px-[var(--card-padding)] pb-5 pt-2">
      <header className="shrink-0 flex items-center justify-between gap-3">
        <p className="stage-heading">Trial</p>
        <CountdownBadge deadlineAt={deadlineAt} />
      </header>
      <p className="mt-3 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-xl font-black text-slate-900 sm:text-2xl">
        {prompt}
      </p>
      <div className="mt-3 flex justify-center">
        <PlayerBox color={target.color} emoji={target.emoji} name={target.name} />
      </div>
      <p className={`mt-2 text-center text-lg font-bold ${truthToneClass}`}>
        {truthVisible ? `${truth ? "Guilty" : "Innocent"}` : "???"}
      </p>
      <p className="stage-subheading mt-3 text-center">Guesses:</p>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <div className="relative flex items-start gap-4">
          <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-slate-200" />

          <div className={`min-w-0 flex-1 ${innocentPanelClass}`}>
            <p className="stage-subheading text-center font-black">Innocent</p>
            <ul className="mt-2 grid gap-2">
              {innocentRows.map((row) => (
                <li className="flex justify-center" key={row.id}>
                  <PlayerBox
                    className={truthVisible && !row.correct ? "player-box-trial-wrong" : ""}
                    color={row.guesserColor}
                    emoji={row.guesserEmoji}
                    name={row.guesserName}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className={`min-w-0 flex-1 ${guiltyPanelClass}`}>
            <p className="stage-subheading text-center font-black">Guilty</p>
            <ul className="mt-2 grid gap-2">
              {guiltyRows.map((row) => (
                <li className="flex justify-center" key={row.id}>
                  <PlayerBox
                    className={truthVisible && !row.correct ? "player-box-trial-wrong" : ""}
                    color={row.guesserColor}
                    emoji={row.guesserEmoji}
                    name={row.guesserName}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {canControl ? (
        <div className="mt-3 shrink-0 border-t border-slate-200 pt-3">
          <button
            className="w-full rounded-2xl bg-black px-4 py-3 text-xl font-bold text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void (truthVisible ? onNext() : onReveal())}
            type="button"
          >
            {busy ? "..." : truthVisible ? "Next" : "Reveal"}
          </button>
        </div>
      ) : (
        <p className="stage-subheading mt-3 shrink-0 border-t border-slate-200 pt-3 text-center">
          Waiting for {target.name} {target.emoji}
        </p>
      )}
    </section>
  );
}
