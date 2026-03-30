"use client";

import { StageHeader } from "@/components/stage-header";

type TeamSummary = {
  teamIndex: number;
  teamName: string;
  color: string;
  totalScore: number;
  topPlayerName: string | null;
  topPlayerScore: number;
};

type FinishedStageProps = {
  summaries: TeamSummary[];
  isHost: boolean;
  busy: boolean;
  onPlayAgain: () => Promise<void>;
};

export function FinishedStage({
  summaries,
  isHost,
  busy,
  onPlayAgain,
}: FinishedStageProps) {
  return (
    <section className="card-enter flex min-h-0 flex-1 flex-col overflow-y-auto pb-4">
      <StageHeader
        description="The full deck is cleared. Totals stay visible here until the host resets to the lobby."
        title="Final Results"
      />

      <div className="mt-4 grid gap-3">
        {summaries.map((team) => (
          <article
            className="rounded-3xl border-2 bg-white px-5 py-4"
            key={team.teamIndex}
            style={{ borderColor: team.color }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Team {team.teamIndex + 1}
                </p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">{team.teamName}</h3>
              </div>
              <p className="text-3xl font-black text-slate-950">{team.totalScore}</p>
            </div>

            <p className="mt-4 text-sm font-medium text-slate-600">
              Top player:{" "}
              <span className="font-black text-slate-900">
                {team.topPlayerName ? `${team.topPlayerName} (${team.topPlayerScore})` : "None yet"}
              </span>
            </p>
          </article>
        ))}
      </div>

      {isHost ? (
        <button
          className="mt-4 rounded-2xl bg-black px-4 py-4 text-base font-bold text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void onPlayAgain()}
          type="button"
        >
          {busy ? "..." : "Back to lobby"}
        </button>
      ) : (
        <p className="mt-4 text-sm font-semibold text-slate-500">
          Waiting for the host to send everyone back to the lobby.
        </p>
      )}
    </section>
  );
}
