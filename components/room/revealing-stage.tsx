"use client";

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

function guessLabel(value: boolean) {
  return value ? "Guilty" : "Not guilty";
}

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
  return (
    <section className="card-enter rounded-3xl border border-slate-200 bg-white p-5 pb-28 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">* Reveal</p>
        <CountdownBadge deadlineAt={deadlineAt} prefix="T" />
      </div>
      <p className="mt-3 rounded-2xl bg-violet-50 px-4 py-3 text-xl font-black text-violet-900 sm:text-2xl">
        {prompt}
      </p>
      <p className="mt-4 text-2xl font-black tracking-tight sm:text-3xl" style={{ color: target.color }}>
        {target.name} {target.emoji}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-700">
        {truthVisible ? `Truth: ${truth ? "Guilty" : "Not guilty"}` : "Truth: ?"}
      </p>
      <ul className="mt-3 grid gap-2">
        {guessRows.map((row) => (
          <li
            className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"
            key={row.id}
          >
            <span className="font-semibold" style={{ color: row.guesserColor }}>
              {row.guesserName} {row.guesserEmoji}: {guessLabel(row.guessedAnswer)}
            </span>
            {truthVisible ? (
              <span className={row.correct ? "text-emerald-600" : "text-rose-600"}>
                {row.correct ? "OK" : "X"}
              </span>
            ) : (
              <span className="text-slate-400">...</span>
            )}
          </li>
        ))}
      </ul>
      {canControl ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3">
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
        <p className="mt-4 text-sm font-semibold text-slate-500">
          Waiting for {target.name} {target.emoji}
        </p>
      )}
    </section>
  );
}
