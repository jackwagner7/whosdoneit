"use client";

import { PlayerBox } from "@/components/player-box";
import { CountdownBadge } from "@/components/games/whosdoneit/room/countdown-badge";

type RevealTruthRow = {
  id: string;
  name: string;
  color: string;
  emoji: string;
  answer: boolean;
};

type RevealSummaryStageProps = {
  prompt: string;
  truthRows: RevealTruthRow[];
  deadlineAt: string | null;
  canAdvance: boolean;
  busy: boolean;
  onNext: () => Promise<void>;
};

export function RevealSummaryStage({
  prompt,
  truthRows,
  deadlineAt,
  canAdvance,
  busy,
  onNext,
}: RevealSummaryStageProps) {
  const innocentRows = truthRows.filter((row) => row.answer === false);
  const guiltyRows = truthRows.filter((row) => row.answer === true);

  return (
    <section className="card-enter -mx-[var(--card-padding)] flex min-h-0 min-w-0 flex-1 flex-col px-[var(--card-padding)] pb-5 pt-2">
      <header className="shrink-0 flex items-center justify-between gap-3">
        <p className="stage-heading">Reveal</p>
        <CountdownBadge deadlineAt={deadlineAt} />
      </header>
      <p className="mt-3 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-xl font-black text-slate-900 sm:text-2xl">
        {prompt}
      </p>
      <p className="stage-subheading mt-3 text-center">Truths:</p>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        <div className="relative flex items-start gap-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-slate-200"
          />

          <div className="min-w-0 flex-1 rounded-2xl border border-sky-200 bg-sky-100 p-3">
            <p className="stage-subheading text-center">Innocent</p>
            <ul className="mt-2 grid gap-2">
              {innocentRows.map((row) => (
                <li className="flex justify-center" key={row.id}>
                  <PlayerBox color={row.color} emoji={row.emoji} name={row.name} />
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0 flex-1 rounded-2xl bg-rose-50 p-3">
            <p className="stage-subheading text-center">Guilty</p>
            <ul className="mt-2 grid gap-2">
              {guiltyRows.map((row) => (
                <li className="flex justify-center" key={row.id}>
                  <PlayerBox color={row.color} emoji={row.emoji} name={row.name} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {canAdvance ? (
        <div className="mt-3 shrink-0 border-t border-slate-200 pt-3">
          <button
            className="w-full rounded-2xl bg-black px-4 py-3 text-xl font-bold text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void onNext()}
            type="button"
          >
            {busy ? "..." : "Next"}
          </button>
        </div>
      ) : (
        <p className="stage-subheading mt-3 shrink-0 border-t border-slate-200 pt-3 text-center">
          Waiting for host
        </p>
      )}
    </section>
  );
}
