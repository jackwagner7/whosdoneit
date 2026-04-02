"use client";

import { CountdownBadge } from "@/components/countdown-badge";
import { PlayerBox } from "@/components/player-box";
import { StageFooter, StageFooterMessage } from "@/components/stage-footer";
import { StageHeader } from "@/components/stage-header";
import { StageShell } from "@/components/stage-shell";

type RevealTruthRow = {
  id: string;
  name: string;
  color: string;
  emoji: string;
  answer: boolean;
};

type HostPlayerDisplay = {
  name: string;
  color: string;
  emoji: string;
};

type RevealSummaryStageProps = {
  prompt: string;
  truthRows: RevealTruthRow[];
  hostPlayer: HostPlayerDisplay | null;
  deadlineAt: string | null;
  canAdvance: boolean;
  busy: boolean;
  onNext: () => Promise<void>;
};

export function RevealSummaryStage({
  prompt,
  truthRows,
  hostPlayer,
  deadlineAt,
  canAdvance,
  busy,
  onNext,
}: RevealSummaryStageProps) {
  const innocentRows = truthRows.filter((row) => row.answer === false);
  const guiltyRows = truthRows.filter((row) => row.answer === true);

  return (
    <StageShell>
      <StageHeader title="Reveal" />
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
        <StageFooter>
          <button
            className="grid w-full grid-cols-[4.75rem_1fr_4.75rem] items-stretch overflow-hidden rounded-2xl bg-black text-xl font-bold text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void onNext()}
            type="button"
          >
            <span aria-hidden="true" />
            <span className="flex items-center justify-center px-4 py-3 text-center">
              {busy ? "..." : "Next"}
            </span>
            {!busy ? (
              <CountdownBadge deadlineAt={deadlineAt} variant="button-dark" />
            ) : (
              <span aria-hidden="true" className="border-l border-white/20" />
            )}
          </button>
        </StageFooter>
      ) : (
        <StageFooterMessage deadlineAt={deadlineAt}>
          {hostPlayer ? (
            <PlayerBox color={hostPlayer.color} emoji={hostPlayer.emoji} name={hostPlayer.name} />
          ) : (
            "Waiting for host"
          )}
        </StageFooterMessage>
      )}
    </StageShell>
  );
}
